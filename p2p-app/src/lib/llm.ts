import Anthropic from "@anthropic-ai/sdk";

export interface ExtractedInvoiceLine {
  description: string;
  hsn_sac: string | null;
  qty: number;
  unit_price: number;
  tax_rate_pct: number;
  line_total: number;
}

export interface ExtractedInvoice {
  vendor_name: string;
  vendor_gstin: string | null;
  invoice_number: string;
  invoice_date: string;
  po_number: string | null;
  currency: string;
  lines: ExtractedInvoiceLine[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  grand_total: number;
  confidence: number;
  notes: string;
}

export interface AwardRecommendation {
  recommended_vendor: string;
  reasoning: string;
  risks: string[];
  negotiation_tips: string[];
}

export interface QuoteContextRow {
  vendorName: string;
  landedUnitCosts: number[];
  comparableTotal: number;
  deliveryDays: number;
  creditDays: number;
  advancePct: number;
  rating: number;
  score: number;
  validityDays: number | null;
  notes: string | null;
}

export class LLMConfigError extends Error {}

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function llmMockMode(): boolean {
  return !llmConfigured();
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

function requireClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new LLMConfigError("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

function parseJsonBlock<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as T;
}

const INVOICE_SCHEMA_PROMPT = `Extract this vendor invoice document. Respond with ONLY JSON matching this schema, no prose:
{"vendor_name":str, "vendor_gstin":str|null, "invoice_number":str,
 "invoice_date":"YYYY-MM-DD", "po_number":str|null, "currency":str,
 "lines":[{"description":str,"hsn_sac":str|null,"qty":num,
           "unit_price":num,"tax_rate_pct":num,"line_total":num}],
 "subtotal":num, "cgst":num, "sgst":num, "igst":num,
 "grand_total":num, "confidence":0-1,
 "notes":"anything ambiguous or unreadable"}
Use null for missing fields. Never guess a PO number.`;

export async function extractInvoiceFromDocument(
  base64: string,
  mimeType: string,
): Promise<{ invoice: ExtractedInvoice; mock: boolean }> {
  if (!llmConfigured()) {
    return { invoice: mockExtractedInvoice(), mock: true };
  }

  const client = requireClient();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: mimeType as "application/pdf",
              data: base64,
            },
          },
          { type: "text", text: INVOICE_SCHEMA_PROMPT },
        ],
      },
    ],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { invoice: parseJsonBlock<ExtractedInvoice>(text), mock: false };
}

export async function recommendAward(
  quotes: QuoteContextRow[],
): Promise<{ recommendation: AwardRecommendation; mock: boolean }> {
  if (!llmConfigured()) {
    return { recommendation: mockRecommendation(quotes), mock: true };
  }

  const client = requireClient();
  const table = quotes
    .map(
      (q) =>
        `${q.vendorName}: comparableTotal=${q.comparableTotal.toFixed(2)}, landedUnitCosts=[${q.landedUnitCosts.map((c) => c.toFixed(2)).join(", ")}], deliveryDays=${q.deliveryDays}, creditDays=${q.creditDays}, advancePct=${q.advancePct}, rating=${q.rating}, totalScore=${q.score.toFixed(1)}, validityDays=${q.validityDays ?? "n/a"}, notes=${q.notes ?? "none"}`,
    )
    .join("\n");

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `You are a procurement analyst comparing vendor quotes for an RFQ. The normalised landed-cost table and weighted scores are computed deterministically (do not re-compute arithmetic). Based on the data, recommend a vendor.

Data:
${table}

Respond with ONLY JSON matching this schema, no prose:
{"recommended_vendor":str, "reasoning":str, "risks":[str], "negotiation_tips":[str]}`,
      },
    ],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { recommendation: parseJsonBlock<AwardRecommendation>(text), mock: false };
}

const MOCK_INVOICE: ExtractedInvoice = {
  vendor_name: "Acme Industrial Supplies Pvt Ltd",
  vendor_gstin: "27AACCA1234F1Z5",
  invoice_number: "INV-2026-0147",
  invoice_date: "2026-07-24",
  po_number: "PO/2026/00001",
  currency: "INR",
  lines: [
    {
      description: "Mild Steel Angle 50x50x5mm",
      hsn_sac: "7308",
      qty: 300,
      unit_price: 465,
      tax_rate_pct: 18,
      line_total: 164610,
    },
  ],
  subtotal: 139500,
  cgst: 12555,
  sgst: 12555,
  igst: 0,
  grand_total: 164610,
  confidence: 0.97,
  notes: "Mock extraction — no ANTHROPIC_API_KEY configured; values are a sample, not read from the document.",
};

function mockExtractedInvoice(): ExtractedInvoice {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return { ...MOCK_INVOICE, invoice_date: iso };
}

function mockRecommendation(quotes: QuoteContextRow[]): AwardRecommendation {
  const ranked = [...quotes].sort((a, b) => b.score - a.score || a.comparableTotal - b.comparableTotal);
  const top = ranked[0];
  const runnerUp = ranked[1];
  if (!top) {
    return {
      recommended_vendor: "",
      reasoning: "No quotes to compare.",
      risks: [],
      negotiation_tips: [],
    };
  }
  return {
    recommended_vendor: top.vendorName,
    reasoning: `Highest weighted score (${top.score.toFixed(1)}/100) after landed-cost normalisation (₹${top.comparableTotal.toFixed(2)} comparable total).`,
    risks: top.validityDays
      ? [`Quote valid only ${top.validityDays} days`]
      : [],
    negotiation_tips: runnerUp
      ? [`Ask ${top.vendorName} to firm up validity`, `Benchmark against ${runnerUp.vendorName} at ₹${runnerUp.comparableTotal.toFixed(2)}`]
      : [],
  };
}

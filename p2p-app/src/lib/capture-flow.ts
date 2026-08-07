import type { TxClient } from "@/lib/db";
import {
  CAP_EXTRACTED,
  CAP_VERIFIED,
  CAP_CONVERTED,
  CAP_REJECTED,
  validateExtraction,
  routeForExtraction,
} from "@/lib/captures";
import { extractInvoiceFromDocument, type ExtractedInvoice } from "@/lib/llm";
import {
  INV_RECEIVED,
  SYNC_NONE,
  NOTIFY_INV_CREATED,
  matchLine,
  computeTotals,
  computeTdsAmount,
} from "@/lib/invoices";
import { nextDocNumber, DOC_ENTITY_INVOICE } from "@/lib/numbers";
import { notifyUser } from "@/lib/workflow";
import { logAudit } from "@/lib/audit";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function nameOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const overlap = ta.filter((t) => tb.includes(t)).length;
  return overlap / Math.max(ta.length, tb.length);
}

interface PoLineLike {
  id: string;
  itemId: string;
  itemCode: string;
  name: string;
  hsnSac: string;
  unit: string;
  qty: number;
  unitPrice: number;
  taxRatePct: number;
}

export function matchExtractedToPoLine(
  poLines: PoLineLike[],
  extracted: { description: string; hsn_sac: string | null },
): PoLineLike | null {
  if (extracted.hsn_sac) {
    const byHsn = poLines.find((l) => l.hsnSac === extracted.hsn_sac);
    if (byHsn) return byHsn;
  }
  let best: PoLineLike | null = null;
  let bestScore = 0;
  for (const line of poLines) {
    const score = nameOverlap(extracted.description, line.name);
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

export async function runExtraction(
  tx: TxClient,
  input: {
    orgId: string;
    captureId: string;
    base64: string;
    mimeType: string;
    actorId: string;
    actorEmail: string;
    ip?: string | null;
  },
) {
  const capture = await tx.capturedDocument.findFirst({
    where: { id: input.captureId, orgId: input.orgId },
  });
  if (!capture) throw new Error("Captured document not found");
  if ([CAP_CONVERTED, CAP_REJECTED].includes(capture.status)) {
    throw new Error("Document has already been processed");
  }

  const result = await extractInvoiceFromDocument(input.base64, input.mimeType);
  const validation = validateExtraction(result.invoice);
  const route = routeForExtraction({
    confidence: result.invoice.confidence,
    arithmeticOk: validation.arithmeticOk,
    criticalMissing: validation.criticalMissing,
  });

  const updated = await tx.capturedDocument.update({
    where: { id: capture.id },
    data: {
      status: CAP_EXTRACTED,
      extractedJson: JSON.stringify(result.invoice),
      confidence: result.invoice.confidence,
      validationJson: JSON.stringify(validation),
      route,
      error: null,
    },
  });

  await logAudit(tx, {
    orgId: input.orgId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    entity: "CAPTURE",
    entityId: capture.id,
    action: "EXTRACT",
    after: {
      confidence: result.invoice.confidence,
      route,
      issues: validation.issues.length,
      mock: result.mock,
    },
    ip: input.ip ?? null,
  });

  return { capture: updated, validation, mock: result.mock };
}

export interface ConvertCaptureData {
  poId: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  tdsSection?: string | null;
  tdsRate?: number | null;
}

export async function convertCaptureToInvoice(
  tx: TxClient,
  input: {
    orgId: string;
    actorId: string;
    actorEmail: string;
    captureId: string;
    data: ConvertCaptureData;
    ip?: string | null;
  },
) {
  const capture = await tx.capturedDocument.findFirst({
    where: { id: input.captureId, orgId: input.orgId },
  });
  if (!capture) throw new Error("Captured document not found");
  if (capture.status === CAP_CONVERTED) {
    throw new Error("This capture has already been converted to an invoice");
  }
  if (capture.status === CAP_REJECTED) {
    throw new Error("A rejected capture cannot be converted");
  }

  let extracted: ExtractedInvoice | null = null;
  if (capture.extractedJson) {
    try {
      extracted = JSON.parse(capture.extractedJson) as ExtractedInvoice;
    } catch {
      extracted = null;
    }
  }
  if (!extracted) {
    throw new Error("No extraction available — run extraction before converting");
  }

  const invoiceNumber = (input.data.invoiceNumber ?? extracted.invoice_number ?? "").trim();
  const invoiceDate = (input.data.invoiceDate ?? extracted.invoice_date ?? "").trim();
  if (!invoiceNumber) throw new Error("Vendor invoice number is required");
  if (!invoiceDate) throw new Error("Invoice date is required");

  const existing = await tx.invoice.findFirst({
    where: { orgId: input.orgId, invoiceNumber },
  });
  if (existing) {
    throw new Error(
      `Invoice ${invoiceNumber} has already been recorded (${existing.code})`,
    );
  }

  const purchaseOrder = await tx.purchaseOrder.findFirst({
    where: { id: input.data.poId, orgId: input.orgId },
    include: {
      vendor: true,
      lines: { orderBy: { itemCode: "asc" } },
      requisition: { select: { requesterId: true, code: true } },
    },
  });
  if (!purchaseOrder) throw new Error("Purchase order not found");

  const lines = (extracted.lines ?? []).map((extractedLine) => {
    const poLine = matchExtractedToPoLine(
      purchaseOrder.lines,
      extractedLine,
    );
    const subtotal = Math.round(extractedLine.qty * extractedLine.unit_price * 100) / 100;
    const taxRatePct =
      poLine && poLine.taxRatePct > 0 ? poLine.taxRatePct : (extractedLine.tax_rate_pct ?? 0);
    const taxAmount = Math.round(subtotal * taxRatePct * 100) / 10000;
    const lineTotal = Math.round((subtotal + taxAmount) * 100) / 100;
    const match = matchLine(
      {
        itemCode: poLine?.itemCode ?? "",
        qty: extractedLine.qty,
        unitPrice: extractedLine.unit_price,
      },
      poLine
        ? {
            itemCode: poLine.itemCode,
            qty: poLine.qty,
            unitPrice: poLine.unitPrice,
          }
        : null,
    );
    return {
      poLineId: poLine?.id ?? null,
      itemId: poLine?.itemId ?? "",
      itemCode: poLine?.itemCode ?? "",
      name: extractedLine.description,
      hsnSac: extractedLine.hsn_sac ?? poLine?.hsnSac ?? "",
      qty: extractedLine.qty,
      unit: poLine?.unit ?? "Nos",
      unitPrice: extractedLine.unit_price,
      taxRatePct,
      subtotal,
      taxAmount,
      lineTotal,
      matchStatus: match.matchStatus,
      matchNotes: match.matchNotes,
    };
  });

  if (lines.length === 0) {
    throw new Error("Extraction contains no line items to convert");
  }

  const totals = computeTotals(lines);
  const tdsRate = input.data.tdsRate ?? null;
  const tdsAmount = computeTdsAmount(totals.subtotal, tdsRate);
  const totalAmount = Math.round((totals.totalAmount + tdsAmount) * 100) / 100;

  const code = await nextDocNumber(tx, input.orgId, DOC_ENTITY_INVOICE);
  const invoice = await tx.invoice.create({
    data: {
      orgId: input.orgId,
      code,
      vendorId: purchaseOrder.vendorId,
      poId: purchaseOrder.id,
      invoiceNumber,
      invoiceDate: new Date(`${invoiceDate}T00:00:00`),
      dueDate: input.data.dueDate ? new Date(`${input.data.dueDate}T00:00:00`) : null,
      status: INV_RECEIVED,
      currency: purchaseOrder.currency,
      notes: input.data.notes?.trim() || null,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      tdsAmount,
      tdsSection: input.data.tdsSection?.trim() || null,
      tdsRate,
      totalAmount,
      syncStatus: SYNC_NONE,
      createdById: input.actorId,
      lines: { create: lines.map((l, index) => ({ ...l, lineNo: index + 1 })) },
    },
    include: { vendor: true, purchaseOrder: true, lines: true },
  });

  await tx.capturedDocument.update({
    where: { id: capture.id },
    data: {
      status: CAP_CONVERTED,
      invoiceId: invoice.id,
      reviewedById: input.actorId,
      reviewedAt: new Date(),
    },
  });

  await logAudit(tx, {
    orgId: input.orgId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    entity: "CAPTURE",
    entityId: capture.id,
    action: "CONVERT",
    after: { invoiceCode: code, poCode: purchaseOrder.code, totalAmount },
    ip: input.ip ?? null,
  });
  await logAudit(tx, {
    orgId: input.orgId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    entity: "INVOICE",
    entityId: invoice.id,
    action: "CREATE",
    after: {
      code,
      invoiceNumber,
      poCode: purchaseOrder.code,
      vendorCode: purchaseOrder.vendor.code,
      totalAmount,
      source: "CAPTURE",
    },
    ip: input.ip ?? null,
  });

  if (purchaseOrder.requisition.requesterId) {
    await notifyUser(tx, {
      orgId: input.orgId,
      userId: purchaseOrder.requisition.requesterId,
      type: NOTIFY_INV_CREATED,
      title: "Vendor invoice received",
      message: `${invoiceNumber} (${code}) was captured from the invoice inbox and matched to ${purchaseOrder.code}.`,
      docType: "INV",
      docId: invoice.id,
    });
  }

  return invoice;
}

export function isPendingForReview(status: string): boolean {
  return [CAP_EXTRACTED, CAP_VERIFIED].includes(status);
}

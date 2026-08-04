import { createHash } from "node:crypto";

export const CAP_CAPTURED = "CAPTURED";
export const CAP_EXTRACTED = "EXTRACTED";
export const CAP_VERIFIED = "VERIFIED";
export const CAP_CONVERTED = "CONVERTED";
export const CAP_REJECTED = "REJECTED";
export const CAP_ERROR = "ERROR";

export const ROUTE_AUTO_MATCH = "AUTO_MATCH";
export const ROUTE_REVIEW = "REVIEW";
export const ROUTE_MANUAL = "MANUAL";

export const CAPTURE_ROUTE_TONES: Record<string, string> = {
  [ROUTE_AUTO_MATCH]: "teal",
  [ROUTE_REVIEW]: "amber",
  [ROUTE_MANUAL]: "red",
};

export interface ExtractedLineInput {
  qty: number;
  unit_price: number;
  tax_rate_pct: number;
  line_total: number;
}

export interface ExtractedInvoiceForValidation {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  vendor_gstin: string | null;
  po_number: string | null;
  lines: ExtractedLineInput[];
  subtotal: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  grand_total: number | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function validateGstin(gstin: string | null): boolean {
  if (!gstin) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin);
}

export function validateDateString(iso: string | null): boolean {
  if (!iso) return false;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(now.getFullYear() - 2);
  if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return false;
  if (date.getTime() < twoYearsAgo.getTime()) return false;
  return true;
}

export function validateExtraction(inv: ExtractedInvoiceForValidation): {
  issues: ValidationIssue[];
  arithmeticOk: boolean;
  criticalMissing: boolean;
} {
  const issues: ValidationIssue[] = [];

  if (!inv.lines || inv.lines.length === 0) {
    issues.push({
      field: "lines",
      message: "No line items extracted",
      severity: "error",
    });
  }

  const recomputedSubtotal =
    Math.round(
      (inv.lines ?? []).reduce((sum, l) => sum + l.qty * l.unit_price, 0) * 100,
    ) / 100;
  const subtotalDelta =
    inv.subtotal === null || inv.subtotal === undefined
      ? null
      : Math.abs(recomputedSubtotal - inv.subtotal);
  if (subtotalDelta !== null && subtotalDelta > 0.05) {
    issues.push({
      field: "subtotal",
      message: `Σ qty×price (₹${recomputedSubtotal.toFixed(2)}) ≠ extracted subtotal (₹${inv.subtotal?.toFixed(2)})`,
      severity: "error",
    });
  }

  const taxSum =
    Math.round(((inv.cgst ?? 0) + (inv.sgst ?? 0) + (inv.igst ?? 0)) * 100) / 100;
  const totalDelta =
    inv.grand_total === null || inv.grand_total === undefined
      ? null
      : Math.abs((inv.subtotal ?? recomputedSubtotal) + taxSum - inv.grand_total);
  if (totalDelta !== null && totalDelta > 0.05) {
    issues.push({
      field: "grand_total",
      message: `Subtotal + taxes (₹${((inv.subtotal ?? recomputedSubtotal) + taxSum).toFixed(2)}) ≠ extracted total (₹${inv.grand_total?.toFixed(2)})`,
      severity: "error",
    });
  }

  if (inv.vendor_gstin && !validateGstin(inv.vendor_gstin)) {
    issues.push({
      field: "vendor_gstin",
      message: `GSTIN ${inv.vendor_gstin} is not a valid 15-character format`,
      severity: "warning",
    });
  }

  if (inv.invoice_date && !validateDateString(inv.invoice_date)) {
    issues.push({
      field: "invoice_date",
      message: `Invoice date ${inv.invoice_date} is outside the accepted range`,
      severity: "warning",
    });
  }

  const arithmeticOk = !issues.some(
    (i) => i.field === "subtotal" || i.field === "grand_total",
  );

  const criticalMissing = [
    inv.invoice_number,
    inv.invoice_date,
    inv.vendor_name,
    inv.grand_total,
  ].some((v) => v === null || v === undefined || v === "");

  return { issues, arithmeticOk, criticalMissing };
}

export function routeForExtraction(input: {
  confidence: number;
  arithmeticOk: boolean;
  criticalMissing: boolean;
}): string {
  if (input.confidence < 0.7 || !input.arithmeticOk) return ROUTE_MANUAL;
  if (input.confidence >= 0.9 && !input.criticalMissing) return ROUTE_AUTO_MATCH;
  return ROUTE_REVIEW;
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

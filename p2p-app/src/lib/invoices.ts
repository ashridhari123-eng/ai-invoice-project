export const INV_RECEIVED = "RECEIVED";
export const INV_MATCHED = "MATCHED";
export const INV_SUBMITTED = "SUBMITTED";
export const INV_APPROVED = "APPROVED";
export const INV_REJECTED = "REJECTED";
export const INV_CANCELLED = "CANCELLED";
export const INV_BOOKED = "BOOKED";
export const INV_PAID = "PAID";

export const SYNC_NONE = "NONE";
export const SYNC_PENDING = "PENDING";
export const SYNC_SUCCESS = "SUCCESS";
export const SYNC_FAILED = "FAILED";

export const NOTIFY_INV_CREATED = "INV_CREATED";
export const NOTIFY_INV_MATCHED = "INV_MATCHED";
export const NOTIFY_INV_SUBMITTED = "INV_SUBMITTED";

export const MATCH_MATCHED = "MATCHED";
export const MATCH_QTY_EXCEEDS = "QTY_EXCEEDS_PO";
export const MATCH_QTY_EXCEEDS_GRN = "QTY_EXCEEDS_GRN";
export const MATCH_PRICE_VARIANCE = "PRICE_VARIANCE";
export const MATCH_UNMATCHED = "UNMATCHED";

export const PRICE_TOLERANCE = 0.1;

export interface MatchLineInput {
  itemCode: string;
  qty: number;
  unitPrice: number;
}

export interface MatchResult {
  matchStatus: string;
  matchNotes: string | null;
}

export function matchLine(
  line: MatchLineInput,
  poLine: MatchLineInput | null,
  receivedQty?: number | null,
): MatchResult {
  if (!poLine) {
    return {
      matchStatus: MATCH_UNMATCHED,
      matchNotes: "Item not found on the purchase order",
    };
  }

  if (line.qty > poLine.qty) {
    return {
      matchStatus: MATCH_QTY_EXCEEDS,
      matchNotes: `Qty ${line.qty} exceeds PO qty ${poLine.qty}`,
    };
  }

  if (receivedQty !== undefined && receivedQty !== null && line.qty > receivedQty) {
    return {
      matchStatus: MATCH_QTY_EXCEEDS_GRN,
      matchNotes: `Qty ${line.qty} exceeds received qty ${receivedQty} (GRN)`,
    };
  }

  const priceDelta =
    poLine.unitPrice === 0
      ? 0
      : Math.abs(line.unitPrice - poLine.unitPrice) / poLine.unitPrice;
  if (priceDelta > PRICE_TOLERANCE) {
    return {
      matchStatus: MATCH_PRICE_VARIANCE,
      matchNotes: `Price ${line.unitPrice} differs >${PRICE_TOLERANCE * 100}% from PO rate ${poLine.unitPrice}`,
    };
  }

  return { matchStatus: MATCH_MATCHED, matchNotes: null };
}

export function isFullyMatched(lines: Array<{ matchStatus: string }>): boolean {
  return lines.length > 0 && lines.every((l) => l.matchStatus === MATCH_MATCHED);
}

export function computeTdsAmount(
  subtotal: number,
  tdsRate: number | null | undefined,
): number {
  if (!tdsRate || tdsRate <= 0) return 0;
  return Math.round(subtotal * tdsRate * 100) / 10000;
}

export function computeTotals(
  lines: Array<{ subtotal: number; taxAmount: number; lineTotal: number }>,
): { subtotal: number; taxAmount: number; totalAmount: number } {
  const subtotal =
    Math.round(lines.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100;
  const taxAmount =
    Math.round(lines.reduce((sum, l) => sum + l.taxAmount, 0) * 100) / 100;
  const totalAmount =
    Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
  return { subtotal, taxAmount, totalAmount };
}

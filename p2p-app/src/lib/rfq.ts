export const RFQ_DRAFT = "DRAFT";
export const RFQ_OPEN = "OPEN";
export const RFQ_EVALUATING = "EVALUATING";
export const RFQ_AWARDED = "AWARDED";
export const RFQ_CANCELLED = "CANCELLED";

export const COST_OF_CAPITAL_ANNUAL = 0.12;

export interface QuoteTerms {
  freight: number;
  packing: number;
  otherCharges: number;
  advancePct: number;
  creditDays: number;
  deliveryDays: number;
  warrantyMonths: number;
  validityDays: number;
}

export interface QuoteLineInput {
  qty: number;
  unitPrice: number;
}

export interface LandedQuoteResult {
  goodsTotal: number;
  totalLanded: number;
  cashCost: number;
  comparableTotal: number;
  landedUnitCosts: number[];
}

export function computeLandedQuote(
  lines: QuoteLineInput[],
  terms: QuoteTerms,
): LandedQuoteResult {
  const goodsTotal =
    Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0) * 100) / 100;
  const charges = terms.freight + terms.packing + terms.otherCharges;
  const totalLanded = Math.round((goodsTotal + charges) * 100) / 100;

  const effectiveEarlyDays = (terms.advancePct / 100) * terms.creditDays;
  const cashCost =
    Math.round(
      totalLanded * COST_OF_CAPITAL_ANNUAL * (effectiveEarlyDays / 365) * 100,
    ) / 100;

  const comparableTotal = Math.round((totalLanded + cashCost) * 100) / 100;

  const landedUnitCosts = lines.map((l) => {
    const subtotal = l.qty * l.unitPrice;
    const share = goodsTotal > 0 ? subtotal / goodsTotal : 1 / Math.max(lines.length, 1);
    const landedUnit =
      l.unitPrice + (charges * share + cashCost * share) / Math.max(l.qty, 1);
    return Math.round(landedUnit * 100) / 100;
  });

  return { goodsTotal, totalLanded, cashCost, comparableTotal, landedUnitCosts };
}

export interface ScoreWeights {
  landedCost: number;
  delivery: number;
  paymentTerms: number;
  vendorRating: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  landedCost: 50,
  delivery: 20,
  paymentTerms: 15,
  vendorRating: 15,
};

export interface QuoteScoreInput {
  comparableTotal: number;
  deliveryDays: number;
  creditDays: number;
  vendorRating: number;
}

export interface QuoteScoreResult {
  landedCost: number;
  delivery: number;
  paymentTerms: number;
  vendorRating: number;
  total: number;
}

export function scoreQuotes(
  quotes: QuoteScoreInput[],
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): QuoteScoreResult[] {
  if (quotes.length === 0) return [];

  const minCost = Math.min(...quotes.map((q) => q.comparableTotal));
  const minDelivery = Math.min(...quotes.map((q) => q.deliveryDays));
  const maxCredit = Math.max(...quotes.map((q) => q.creditDays));

  const weightSum = weights.landedCost + weights.delivery + weights.paymentTerms + weights.vendorRating;

  return quotes.map((q) => {
    const landedCost =
      minCost > 0 ? (minCost / q.comparableTotal) * 100 : q.comparableTotal === 0 ? 100 : 0;
    const delivery = minDelivery > 0 ? (minDelivery / q.deliveryDays) * 100 : 100;
    const paymentTerms = maxCredit > 0 ? (q.creditDays / maxCredit) * 100 : 100;
    const vendorRating = Math.max(0, Math.min(100, q.vendorRating));

    const total =
      (weights.landedCost * landedCost +
        weights.delivery * delivery +
        weights.paymentTerms * paymentTerms +
        weights.vendorRating * vendorRating) /
      weightSum;

    return {
      landedCost: Math.round(landedCost * 100) / 100,
      delivery: Math.round(delivery * 100) / 100,
      paymentTerms: Math.round(paymentTerms * 100) / 100,
      vendorRating: Math.round(vendorRating * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  });
}

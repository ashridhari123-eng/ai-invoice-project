export const ADV_RECORDED = "RECORDED";
export const ADV_PARTIALLY_APPLIED = "PARTIALLY_APPLIED";
export const ADV_APPLIED = "APPLIED";
export const ADV_REVERSED = "REVERSED";

export function appliedAdvanceTotal(
  applications: Array<{ amount: number }>,
): number {
  return Math.round(
    applications.reduce((sum, a) => sum + a.amount, 0) * 100,
  ) / 100;
}

export function advanceRemaining(
  amount: number,
  applications: Array<{ amount: number }>,
): number {
  return Math.round((amount - appliedAdvanceTotal(applications)) * 100) / 100;
}

export function advanceStatusFor(
  amount: number,
  applications: Array<{ amount: number }>,
): string {
  const remaining = advanceRemaining(amount, applications);
  if (remaining <= 0) return ADV_APPLIED;
  if (applications.length > 0) return ADV_PARTIALLY_APPLIED;
  return ADV_RECORDED;
}

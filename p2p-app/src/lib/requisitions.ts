import type { TxClient } from "@/lib/db";
import { formatINR } from "@/lib/workflow";

export const PR_DRAFT = "DRAFT";
export const PR_SUBMITTED = "SUBMITTED";
export const PR_APPROVED = "APPROVED";
export const PR_REJECTED = "REJECTED";
export const PR_RETURNED = "RETURNED";
export const PR_CANCELLED = "CANCELLED";

export interface RequisitionLineInput {
  itemId: string;
  qty: number;
  unitPrice: number;
  taxRatePct: number;
}

export interface ComputedLine {
  itemId: string;
  itemCode: string;
  name: string;
  hsnSac: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRatePct: number;
  subtotal: number;
  taxAmount: number;
  lineTotal: number;
}

export function computeLineTotals(
  qty: number,
  unitPrice: number,
  taxRatePct: number,
): { subtotal: number; taxAmount: number; lineTotal: number } {
  const subtotal = Math.round(qty * unitPrice * 100) / 100;
  const taxAmount = Math.round(subtotal * taxRatePct * 100) / 10000;
  const lineTotal = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, lineTotal };
}

export async function resolveLines(
  tx: TxClient,
  orgId: string,
  lines: RequisitionLineInput[],
): Promise<ComputedLine[]> {
  if (lines.length === 0) throw new Error("At least one line is required");

  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const items = await tx.item.findMany({
    where: { orgId, id: { in: itemIds }, isActive: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  return lines.map((line, index) => {
    const item = byId.get(line.itemId);
    if (!item) throw new Error(`Line ${index + 1}: unknown or inactive item`);
    if (line.qty <= 0) throw new Error(`Line ${index + 1}: quantity must be positive`);
    if (line.unitPrice < 0) throw new Error(`Line ${index + 1}: price cannot be negative`);
    const totals = computeLineTotals(line.qty, line.unitPrice, line.taxRatePct);
    return {
      itemId: item.id,
      itemCode: item.code,
      name: item.name,
      hsnSac: item.hsnSac,
      qty: line.qty,
      unit: item.unit,
      unitPrice: line.unitPrice,
      taxRatePct: line.taxRatePct,
      ...totals,
    };
  });
}

export function totalForLines(lines: ComputedLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
}

export async function activeCommitmentSum(
  tx: TxClient,
  budgetId: string,
): Promise<number> {
  const agg = await tx.budgetCommitment.aggregate({
    where: { budgetId, status: "ACTIVE" },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export async function budgetAvailability(
  tx: TxClient,
  orgId: string,
  budgetId: string,
): Promise<{ allocated: number; spent: number; committed: number; available: number }> {
  const budget = await tx.budget.findUnique({
    where: { id: budgetId, orgId },
  });
  if (!budget) throw new Error("Budget not found");
  const committed = await activeCommitmentSum(tx, budgetId);
  const available = budget.allocatedAmount - budget.spentAmount - committed;
  return {
    allocated: budget.allocatedAmount,
    spent: budget.spentAmount,
    committed,
    available,
  };
}

export function formatAmount(value: number): string {
  return formatINR(value);
}

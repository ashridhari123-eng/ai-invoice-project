import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import RequisitionForm from "@/components/RequisitionForm";
import { activeCommitmentSum } from "@/lib/requisitions";

export default async function NewRequisitionPage() {
  const user = await requirePermission(PERMISSIONS.REQUISITIONS_WRITE);

  const [items, budgets] = await Promise.all([
    db.item.findMany({
      where: { orgId: user.orgId, isActive: true },
      orderBy: { name: "asc" },
    }),
    db.budget.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ department: "asc" }, { category: "asc" }],
    }),
  ]);

  const commitments = await Promise.all(
    budgets.map(async (b) => ({
      budgetId: b.id,
      committed: await activeCommitmentSum(db, b.id),
    })),
  );
  const committedByBudget = new Map(
    commitments.map((c) => [c.budgetId, c.committed]),
  );

  const departments = [...new Set(budgets.map((b) => b.department))].sort();

  return (
    <div>
      <PageHeader
        title="New Purchase Requisition"
        subtitle="Describe what you need. The approval route is chosen automatically by value."
      />
      <RequisitionForm
        userDepartment={user.department}
        departments={departments}
        items={items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          hsnSac: i.hsnSac,
          unit: i.unit,
          defaultTaxRatePct: i.defaultTaxRatePct,
        }))}
        budgets={budgets.map((b) => ({
          id: b.id,
          department: b.department,
          category: b.category,
          period: b.period,
          allocatedAmount: b.allocatedAmount,
          spentAmount: b.spentAmount,
          committedAmount: committedByBudget.get(b.id) ?? 0,
        }))}
      />
    </div>
  );
}

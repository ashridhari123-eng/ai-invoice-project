import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatINR } from "@/lib/format";
import { PageHeader, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { activeCommitmentSum } from "@/lib/requisitions";
import BudgetForm from "@/components/BudgetForm";

export default async function BudgetsPage() {
  const user = await requirePermission(PERMISSIONS.BUDGETS_READ);
  const canWrite = can(user.role, PERMISSIONS.BUDGETS_WRITE);

  const budgets = await db.budget.findMany({
    where: { orgId: user.orgId },
    orderBy: [{ department: "asc" }, { category: "asc" }],
  });

  const commitments = await Promise.all(
    budgets.map(async (b) => ({
      budgetId: b.id,
      committed: await activeCommitmentSum(db, b.id),
    })),
  );
  const committedByBudget = new Map(
    commitments.map((c) => [c.budgetId, c.committed]),
  );

  const byDepartment = budgets.reduce<Record<string, { allocated: number; spent: number; committed: number }>>(
    (acc, b) => {
      const bucket = (acc[b.department] ??= { allocated: 0, spent: 0, committed: 0 });
      bucket.allocated += b.allocatedAmount;
      bucket.spent += b.spentAmount;
      bucket.committed += committedByBudget.get(b.id) ?? 0;
      return acc;
    },
    {},
  );

  const departments = [...new Set(budgets.map((b) => b.department))].sort();

  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle="FY 2026 allocation by department and spend category. Requisitions cannot exceed the available limit."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(byDepartment).map(([dept, total]) => (
          <Card key={dept} className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {dept}
            </p>
            <p className="mt-2 font-display text-xl font-bold text-ink">
              {formatINR(total.allocated)}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {formatINR(total.spent + total.committed)} committed ·{" "}
              {formatINR(total.allocated - total.spent - total.committed)} available
            </p>
          </Card>
        ))}
      </div>

      {canWrite ? (
        <Card className="mb-6">
          <div className="border-b border-line px-5 py-4">
            <h3 className="font-display text-base font-semibold text-ink">
              Create a budget line
            </h3>
            <p className="mt-0.5 text-xs text-ink-soft">
              Set a department spending limit for a period before purchase requests are approved.
            </p>
          </div>
          <div className="p-5">
            <BudgetForm departments={departments} />
          </div>
        </Card>
      ) : null}

      <Card>
        {budgets.length === 0 ? (
          <EmptyState message="No budget lines yet. Create one to set a department spending limit." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Department</Th>
                <Th>Category</Th>
                <Th>Period</Th>
                <Th className="text-right">Allocated</Th>
                <Th className="text-right">Committed</Th>
                <Th className="text-right">Spent</Th>
                <Th className="text-right">Available</Th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => {
                const committed = committedByBudget.get(b.id) ?? 0;
                const available = b.allocatedAmount - b.spentAmount - committed;
                const exhausted = available <= 0;
                return (
                  <tr key={b.id} className="hover:bg-paper/40">
                    <Td>
                      <span className="font-medium text-ink">{b.department}</span>
                    </Td>
                    <Td className="text-ink">{b.category.replace("_", " ")}</Td>
                    <Td className="font-mono text-xs text-ink-soft">{b.period}</Td>
                    <Td className="text-right font-mono text-sm font-medium text-ink">
                      {formatINR(b.allocatedAmount)}
                    </Td>
                    <Td className="text-right font-mono text-xs text-ink-soft">
                      {formatINR(committed)}
                    </Td>
                    <Td className="text-right font-mono text-xs text-ink-soft">
                      {formatINR(b.spentAmount)}
                    </Td>
                    <Td
                      className={`text-right font-mono text-sm font-medium ${
                        exhausted ? "text-red-400" : "text-teal"
                      }`}
                    >
                      {formatINR(available)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

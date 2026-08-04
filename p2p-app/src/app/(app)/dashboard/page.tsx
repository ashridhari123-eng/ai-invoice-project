import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatINR, formatDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui";
import {
  INV_RECEIVED,
  INV_MATCHED,
  INV_APPROVED,
  INV_BOOKED,
  INV_PAID,
} from "@/lib/invoices";
import { APPROVAL_PENDING } from "@/lib/workflow";

function KpiCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {label}
        </p>
        <span className={`h-2 w-2 rounded-full ${accent}`} />
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-ink">{value}</p>
      {sub ? <p className="mt-1 text-xs text-ink-soft">{sub}</p> : null}
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();

  const [totalRequisitions, pendingApprovals, pendingInvoices, paymentsDue, recentLogs, spendRows] =
    await Promise.all([
      db.purchaseRequisition.count({ where: { orgId: user.orgId } }),
      db.approvalInstance.count({
        where: { orgId: user.orgId, status: APPROVAL_PENDING, docType: { in: ["PR", "INV"] } },
      }),
      db.invoice.count({
        where: { orgId: user.orgId, status: { in: [INV_RECEIVED, INV_MATCHED] } },
      }),
      db.invoice.aggregate({
        where: { orgId: user.orgId, status: INV_BOOKED, paidAt: null },
        _count: true,
        _sum: { totalAmount: true },
      }),
      db.auditLog.findMany({
        where: { orgId: user.orgId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      db.invoice.findMany({
        where: {
          orgId: user.orgId,
          status: { in: [INV_APPROVED, INV_BOOKED, INV_PAID] },
        },
        select: {
          totalAmount: true,
          purchaseOrder: { select: { requisition: { select: { department: true } } } },
        },
      }),
    ]);

  const spendByDepartment = new Map<string, number>();
  for (const inv of spendRows) {
    const dept = inv.purchaseOrder?.requisition.department ?? "Unassigned";
    spendByDepartment.set(dept, (spendByDepartment.get(dept) ?? 0) + inv.totalAmount);
  }
  const chartRows = [...spendByDepartment.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([dept, total]) => ({ dept, total }));
  const maxSpend = Math.max(1, ...chartRows.map((r) => r.total));

  return (
    <div>
      <div className="mb-6 rounded-lg bg-ink p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
          Procure-to-pay
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">
          Welcome back, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Requisitions, purchase orders, goods receipts, invoices, and payments in one flow.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total purchase requests"
          value={String(totalRequisitions)}
          sub="All requisitions raised"
          accent="bg-blue-500"
        />
        <KpiCard
          label="Pending approvals"
          value={String(pendingApprovals)}
          sub="Waiting on a decision"
          accent="bg-amber"
        />
        <KpiCard
          label="Pending invoices"
          value={String(pendingInvoices)}
          sub="Received, awaiting match"
          accent="bg-pink"
        />
        <KpiCard
          label="Payments due"
          value={formatINR(paymentsDue._sum.totalAmount ?? 0)}
          sub={`${paymentsDue._count} booked invoice${paymentsDue._count === 1 ? "" : "s"} to pay`}
          accent="bg-teal"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Recent activity" subtitle="Latest entries from the audit trail" />
          <div className="divide-y divide-line">
            {recentLogs.length === 0 ? (
              <p className="px-5 py-8 text-sm text-ink-soft">No activity yet.</p>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-ink">
                      <span className="font-mono text-xs text-ink-soft">{log.actorEmail ?? "system"}</span>{" "}
                      {log.action.toLowerCase()}{" "}
                      <span className="font-medium">{log.entity.replace("_", " ")}</span>
                    </p>
                    {log.entityId ? (
                      <p className="truncate font-mono text-xs text-ink-soft">{log.entityId}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Spend by department"
            subtitle="Approved, booked, and paid invoice value"
          />
          {chartRows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-soft">No spend recorded yet.</p>
          ) : (
            <div className="space-y-3 px-5 py-4">
              {chartRows.map((r) => (
                <div key={r.dept}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{r.dept}</span>
                    <span className="font-mono text-xs text-ink-soft">
                      {formatINR(r.total)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full rounded-full bg-teal"
                      style={{ width: `${(r.total / maxSpend) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="pt-2 text-xs text-ink-soft">
                Report · spend summarized from the invoice ledger by department.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

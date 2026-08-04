import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatINR, formatDateTime } from "@/lib/format";
import {
  PageHeader,
  Card,
  Table,
  Th,
  Td,
  StatusBadge,
  EmptyState,
  Button,
} from "@/components/ui";

export default async function RequisitionsPage() {
  const user = await requirePermission(PERMISSIONS.REQUISITIONS_READ);
  const canWrite = can(user.role, PERMISSIONS.REQUISITIONS_WRITE);

  const requisitions = await db.purchaseRequisition.findMany({
    where: { orgId: user.orgId },
    include: {
      requester: { select: { name: true } },
      budget: { select: { department: true, category: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const instances = await db.approvalInstance.findMany({
    where: {
      orgId: user.orgId,
      docType: "PR",
      docId: { in: requisitions.map((r) => r.id) },
    },
    select: { docId: true, status: true, currentStep: true },
  });
  const instanceByDocId = new Map(instances.map((i) => [i.docId, i]));

  return (
    <div>
      <PageHeader
        title="Purchase Requisitions"
        subtitle="Internal requests for goods and services, routed through the approval matrix."
        actions={
          canWrite ? (
            <Link href="/requisitions/new">
              <Button>+ New requisition</Button>
            </Link>
          ) : null
        }
      />

      <Card>
        {requisitions.length === 0 ? (
          <EmptyState message="No requisitions yet. Create the first request." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Requested by</Th>
                <Th>Department</Th>
                <Th>Budget</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map((r) => (
                <tr key={r.id} className="hover:bg-paper/40">
                  <Td>
                    <Link
                      href={`/requisitions/${r.id}`}
                      className="font-mono text-xs font-semibold text-pink hover:underline"
                    >
                      {r.code}
                    </Link>
                  </Td>
                  <Td>
                    <p className="text-xs font-medium text-ink">{r.requester.name}</p>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {r._count.lines} line{r._count.lines === 1 ? "" : "s"}
                    </p>
                  </Td>
                  <Td className="text-xs text-ink">{r.department}</Td>
                  <Td className="text-xs text-ink-soft">
                    {r.budget ? `${r.budget.department} · ${r.budget.category.replace("_", " ")}` : "—"}
                  </Td>
                  <Td className="text-right font-mono text-sm font-medium text-ink">
                    {formatINR(r.totalAmount)}
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                    {(() => {
                      const inst = instanceByDocId.get(r.id);
                      if (!inst || inst.status === "APPROVED" || inst.status === "REJECTED") return null;
                      return (
                        <span className="ml-2 font-mono text-[10px] text-ink-soft">
                          step {inst.currentStep}
                        </span>
                      );
                    })()}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    {r.submittedAt ? formatDateTime(r.submittedAt) : formatDateTime(r.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

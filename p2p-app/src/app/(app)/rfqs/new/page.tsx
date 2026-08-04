import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/roles";
import { PR_APPROVED } from "@/lib/requisitions";
import { PageHeader } from "@/components/ui";
import RfqForm from "@/components/RfqForm";

export default async function NewRfqPage() {
  const user = await requirePermission(PERMISSIONS.RFQ_WRITE);

  const [requisitions, vendors] = await Promise.all([
    db.purchaseRequisition.findMany({
      where: { orgId: user.orgId, status: PR_APPROVED },
      include: {
        requester: { select: { name: true } },
        purchaseOrders: { select: { id: true } },
        rfqs: { select: { id: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { decidedAt: "desc" },
      take: 100,
    }),
    db.vendor.findMany({
      where: { orgId: user.orgId, status: "ACTIVE" },
      select: { id: true, code: true, legalName: true, rating: true },
      orderBy: { legalName: "asc" },
    }),
  ]);

  const eligible = requisitions.filter(
    (r) => r.purchaseOrders.length === 0 && r.rfqs.length === 0,
  );

  return (
    <div>
      <PageHeader
        title="Create Request for Quote"
        subtitle="Pick an approved requisition and invite vendors to quote."
      />
      <RfqForm
        requisitions={eligible.map((r) => ({
          id: r.id,
          code: r.code,
          department: r.department,
          totalAmount: r.totalAmount,
          lineCount: r._count.lines,
          requestedBy: r.requester.name,
        }))}
        vendors={vendors}
      />
    </div>
  );
}

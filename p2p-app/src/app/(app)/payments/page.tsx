import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { INV_APPROVED, INV_BOOKED, INV_PAID } from "@/lib/invoices";
import { appliedAdvanceTotal } from "@/lib/advances";
import { PageHeader, Card } from "@/components/ui";
import PaymentsClient, { type PaymentInvoice } from "@/components/PaymentsClient";

export default async function PaymentsPage() {
  const user = await requirePermission(PERMISSIONS.PAYMENTS_READ);
  const canWrite = can(user.role, PERMISSIONS.PAYMENTS_WRITE);

  const invoices = await db.invoice.findMany({
    where: {
      orgId: user.orgId,
      status: { in: [INV_APPROVED, INV_BOOKED, INV_PAID] },
    },
    include: {
      vendor: { select: { code: true, legalName: true } },
      advanceApplications: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const rows = invoices.map((inv) => ({
    ...inv,
    advanceApplied: appliedAdvanceTotal(inv.advanceApplications),
  }));

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Approved and booked invoices awaiting payment, with advance offsets."
      />
      <Card>
        <PaymentsClient
          invoices={JSON.parse(JSON.stringify(rows)) as PaymentInvoice[]}
          canWrite={canWrite}
        />
      </Card>
    </div>
  );
}

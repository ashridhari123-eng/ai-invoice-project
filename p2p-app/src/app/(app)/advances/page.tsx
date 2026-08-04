import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { PageHeader, Card } from "@/components/ui";
import AdvancesClient, { type AdvanceRow } from "@/components/AdvancesClient";

export default async function AdvancesPage() {
  const user = await requirePermission(PERMISSIONS.ADVANCES_READ);
  const canWrite = can(user.role, PERMISSIONS.ADVANCES_WRITE);

  const [advances, vendors, purchaseOrders, invoices] = await Promise.all([
    db.advancePayment.findMany({
      where: { orgId: user.orgId },
      include: {
        vendor: { select: { id: true, code: true, legalName: true } },
        purchaseOrder: { select: { code: true } },
        createdBy: { select: { name: true } },
        applications: {
          include: {
            invoice: { select: { code: true, invoiceNumber: true } },
          },
          orderBy: { appliedAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.vendor.findMany({
      where: { orgId: user.orgId },
      select: { id: true, code: true, legalName: true },
      orderBy: { legalName: "asc" },
    }),
    db.purchaseOrder.findMany({
      where: { orgId: user.orgId },
      select: { id: true, code: true, vendorId: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.invoice.findMany({
      where: { orgId: user.orgId },
      select: {
        id: true,
        code: true,
        invoiceNumber: true,
        vendorId: true,
        totalAmount: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const serialize = <T,>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;

  return (
    <div>
      <PageHeader
        title="Advances"
        subtitle="Advances paid to vendors, tracked and applied against invoices."
      />
      <Card>
        <AdvancesClient
          advances={serialize(advances) as unknown as AdvanceRow[]}
          vendors={serialize(vendors)}
          purchaseOrders={serialize(purchaseOrders)}
          invoices={serialize(invoices)}
          canWrite={canWrite}
        />
      </Card>
    </div>
  );
}

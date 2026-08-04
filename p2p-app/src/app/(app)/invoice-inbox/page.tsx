import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { PO_SENT } from "@/lib/purchase-orders";
import { PageHeader, Card } from "@/components/ui";
import InvoiceInboxClient, {
  type CaptureRow,
} from "@/components/InvoiceInboxClient";

export default async function InvoiceInboxPage() {
  const user = await requirePermission(PERMISSIONS.CAPTURES_READ);
  const canWrite = can(user.role, PERMISSIONS.CAPTURES_WRITE);

  const [captures, purchaseOrders] = await Promise.all([
    db.capturedDocument.findMany({
      where: { orgId: user.orgId },
      include: {
        invoice: { select: { id: true, code: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.purchaseOrder.findMany({
      where: { orgId: user.orgId, status: PO_SENT },
      include: { vendor: { select: { legalName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const serialize = <T,>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;

  return (
    <div>
      <PageHeader
        title="Invoice Inbox"
        subtitle="Upload vendor invoices — they are extracted, validated, and converted into invoices against purchase orders."
      />
      <Card>
        <InvoiceInboxClient
          captures={serialize(captures) as unknown as CaptureRow[]}
          purchaseOrders={serialize(purchaseOrders)}
          canWrite={canWrite}
        />
      </Card>
    </div>
  );
}

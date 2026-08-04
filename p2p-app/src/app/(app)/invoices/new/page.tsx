import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/roles";
import { PO_SENT } from "@/lib/purchase-orders";
import { PageHeader } from "@/components/ui";
import InvoiceCreateForm from "@/components/InvoiceCreateForm";

export default async function NewInvoicePage() {
  const user = await requirePermission(PERMISSIONS.INVOICES_WRITE);

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { orgId: user.orgId, status: PO_SENT },
    include: {
      vendor: { select: { code: true, legalName: true, tdsSection: true, tdsRate: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { sentAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Record Vendor Invoice"
        subtitle="Enter the vendor's bill against a sent purchase order. Lines are copied from the PO."
      />
      <InvoiceCreateForm
        purchaseOrders={purchaseOrders.map((po) => ({
          id: po.id,
          code: po.code,
          vendorName: po.vendor.legalName,
          vendorCode: po.vendor.code,
          totalAmount: po.totalAmount,
          lineCount: po._count.lines,
          tdsSection: po.vendor.tdsSection,
          tdsRate: po.vendor.tdsRate,
          sentAt: po.sentAt,
        }))}
      />
    </div>
  );
}

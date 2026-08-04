import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { PageHeader, Card } from "@/components/ui";
import VendorForm from "@/components/VendorForm";
import VendorTable from "@/components/VendorTable";

export default async function VendorsPage() {
  const user = await requirePermission(PERMISSIONS.VENDORS_READ);
  const canWrite = can(user.role, PERMISSIONS.VENDORS_WRITE);

  const vendors = await db.vendor.findMany({
    where: { orgId: user.orgId },
    include: { _count: { select: { bankAccounts: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = vendors.map((v) => ({
    id: v.id,
    code: v.code,
    legalName: v.legalName,
    tradeName: v.tradeName,
    pan: v.pan,
    gstin: v.gstin,
    status: v.status,
    category: v.category,
    paymentTermsDays: v.paymentTermsDays,
    currency: v.currency,
    msmeType: v.msmeType,
    bankCount: v._count.bankAccounts,
    createdAt: v.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Supplier master with PAN / GSTIN validation and bank accounts."
        actions={canWrite ? <VendorForm /> : null}
      />
      <Card>
        <VendorTable vendors={rows} canWrite={canWrite} />
      </Card>
    </div>
  );
}

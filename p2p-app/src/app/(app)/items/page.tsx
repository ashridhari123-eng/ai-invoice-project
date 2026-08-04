import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { PageHeader, Card } from "@/components/ui";
import ItemForm from "@/components/ItemForm";
import ItemTable from "@/components/ItemTable";

export default async function ItemsPage() {
  const user = await requirePermission(PERMISSIONS.ITEMS_READ);
  const canWrite = can(user.role, PERMISSIONS.ITEMS_WRITE);

  const items = await db.item.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
  });

  const rows = items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    hsnSac: item.hsnSac,
    unit: item.unit,
    defaultTaxRatePct: item.defaultTaxRatePct,
    isActive: item.isActive,
  }));

  return (
    <div>
      <PageHeader
        title="Items"
        subtitle="Catalog of goods and services with HSN/SAC codes and GST rates."
        actions={canWrite ? <ItemForm /> : null}
      />
      <Card>
        <ItemTable items={rows} canWrite={canWrite} />
      </Card>
    </div>
  );
}

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

export default async function PurchaseOrdersPage() {
  const user = await requirePermission(PERMISSIONS.PO_READ);
  const canWrite = can(user.role, PERMISSIONS.PO_WRITE);

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { orgId: user.orgId },
    include: {
      vendor: { select: { legalName: true } },
      requisition: { select: { code: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle="Formal offers sent to vendors, created from approved requisitions."
        actions={
          canWrite ? (
            <Link href="/requisitions">
              <Button>+ From approved requisition</Button>
            </Link>
          ) : null
        }
      />

      <Card>
        {purchaseOrders.length === 0 ? (
          <EmptyState message="No purchase orders yet. Convert an approved requisition to create the first one." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Vendor</Th>
                <Th>Source PR</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Sent</Th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-paper/40">
                  <Td>
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="font-mono text-xs font-semibold text-pink hover:underline"
                    >
                      {po.code}
                    </Link>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {po._count.lines} line{po._count.lines === 1 ? "" : "s"}
                    </p>
                  </Td>
                  <Td>
                    <p className="text-xs font-medium text-ink">{po.vendor.legalName}</p>
                  </Td>
                  <Td className="font-mono text-xs text-ink-soft">{po.requisition.code}</Td>
                  <Td className="text-right font-mono text-sm font-medium text-ink">
                    {formatINR(po.totalAmount)}
                  </Td>
                  <Td>
                    <StatusBadge status={po.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    {po.sentAt ? formatDateTime(po.sentAt) : "—"}
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

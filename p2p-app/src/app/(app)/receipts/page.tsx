import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatDateTime } from "@/lib/format";
import {
  PageHeader,
  Card,
  Table,
  Th,
  Td,
  EmptyState,
  StatusBadge,
} from "@/components/ui";
import { ROLE_STORES } from "@/lib/roles";

export default async function ReceiptsPage() {
  const user = await requirePermission(PERMISSIONS.RECEIPTS_READ);
  const canWrite = can(user.role, PERMISSIONS.RECEIPTS_WRITE);

  const receipts = await db.goodsReceipt.findMany({
    where: { orgId: user.orgId },
    include: {
      purchaseOrder: {
        select: { id: true, code: true, status: true, vendor: { select: { legalName: true } } },
      },
      lines: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Goods Receipts"
        subtitle="Recorded receipts against purchase orders — the source of truth for 3-way matching."
        actions={
          canWrite ? (
            <Link
              href="/receipts/new"
              className="rounded-md bg-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pink-600"
            >
              Record receipt
            </Link>
          ) : undefined
        }
      />

      <Card>
        {receipts.length === 0 ? (
          <EmptyState message="No goods receipts recorded yet. Open a sent purchase order and record receipt of goods." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Purchase order</Th>
                <Th>Vendor</Th>
                <Th>Received</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Qty</Th>
                <Th>PO status</Th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-paper/40">
                  <Td>
                    <Link
                      href={`/receipts/${r.id}`}
                      className="font-mono text-sm font-semibold text-pink hover:underline"
                    >
                      {r.code}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/purchase-orders/${r.purchaseOrder.id}`}
                      className="font-mono text-xs font-semibold text-ink hover:underline"
                    >
                      {r.purchaseOrder.code}
                    </Link>
                  </Td>
                  <Td className="text-ink">{r.purchaseOrder.vendor.legalName}</Td>
                  <Td>
                    <p className="text-xs text-ink">{formatDateTime(r.receivedAt)}</p>
                    <p className="text-[10px] text-ink-soft">{r.receivedBy ?? "—"}</p>
                  </Td>
                  <Td className="text-right font-mono text-xs text-ink">{r.lines.length}</Td>
                  <Td className="text-right font-mono text-sm font-medium text-ink">
                    {r.lines.reduce((s, l) => s + l.qtyReceived, 0)}
                  </Td>
                  <Td>
                    <StatusBadge status={r.purchaseOrder.status} />
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

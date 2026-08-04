import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/roles";
import { formatDateTime } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardHeader,
  Table,
  Th,
  Td,
  StatusBadge,
  Badge,
} from "@/components/ui";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.RECEIPTS_READ);

  const receipt = await db.goodsReceipt.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      lines: true,
      purchaseOrder: {
        include: {
          vendor: true,
          lines: true,
          requisition: {
            include: { requester: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!receipt) notFound();

  const po = receipt.purchaseOrder;
  const vendor = po.vendor;
  const qtyByPoLine = new Map(
    po.lines.map((l) => [l.id, l.qty]),
  );

  return (
    <div>
      <PageHeader
        title={receipt.code}
        subtitle={`Goods receipt · ${vendor.legalName}`}
        actions={<StatusBadge status={receipt.status} />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Received lines" subtitle={`${receipt.lines.length} line${receipt.lines.length === 1 ? "" : "s"}`} />
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="text-right">PO qty</Th>
                  <Th className="text-right">Received</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((l) => {
                  const poQty = qtyByPoLine.get(l.poLineId) ?? 0;
                  const complete = l.qtyReceived >= poQty;
                  return (
                    <tr key={l.id} className="hover:bg-paper/40">
                      <Td>
                        <p className="text-sm font-medium text-ink">{l.name}</p>
                        <p className="font-mono text-[10px] text-ink-soft">{l.itemCode}</p>
                      </Td>
                      <Td className="text-right font-mono text-sm text-ink">{poQty}</Td>
                      <Td className="text-right font-mono text-sm font-medium text-ink">
                        {l.qtyReceived}
                      </Td>
                      <Td>
                        <Badge tone={complete ? "teal" : "amber"}>
                          {complete ? "Complete" : "Partial"}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          {receipt.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="px-5 py-4 text-sm text-ink">{receipt.notes}</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Receipt" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Received on</dt>
                <dd className="text-xs text-ink">{formatDateTime(receipt.receivedAt)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Received by</dt>
                <dd className="text-xs text-ink">{receipt.receivedBy ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Total qty</dt>
                <dd className="font-mono text-sm font-semibold text-ink">
                  {receipt.lines.reduce((s, l) => s + l.qtyReceived, 0)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Purchase order" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Code</dt>
                <dd>
                  <Link
                    href={`/purchase-orders/${po.id}`}
                    className="font-mono text-xs font-semibold text-pink hover:underline"
                  >
                    {po.code}
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Vendor</dt>
                <dd className="text-xs text-ink">{vendor.legalName}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Requester</dt>
                <dd className="text-xs text-ink">{po.requisition.requester.name}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Status</dt>
                <dd>
                  <StatusBadge status={po.status} />
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

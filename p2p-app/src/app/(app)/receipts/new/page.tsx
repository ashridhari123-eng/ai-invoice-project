import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/roles";
import { formatINR } from "@/lib/format";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import ReceiptForm from "@/components/ReceiptForm";
import { PO_SENT, PO_PARTIALLY_RECEIVED } from "@/lib/purchase-orders";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.RECEIPTS_WRITE);
  const { po } = await searchParams;

  const openOrders = await db.purchaseOrder.findMany({
    where: { orgId: user.orgId, status: { in: [PO_SENT, PO_PARTIALLY_RECEIVED] } },
    include: { vendor: { select: { legalName: true } } },
    orderBy: { createdAt: "desc" },
  });

  let selected = null;
  if (po) {
    const purchaseOrder = await db.purchaseOrder.findFirst({
      where: { id: po, orgId: user.orgId, status: { in: [PO_SENT, PO_PARTIALLY_RECEIVED] } },
      include: { vendor: { select: { legalName: true } }, lines: true },
    });
    if (purchaseOrder) {
      const receipts = await db.goodsReceiptLine.findMany({
        where: { receipt: { orgId: user.orgId, poId: purchaseOrder.id } },
        select: { poLineId: true, qtyReceived: true },
      });
      const receivedMap = new Map<string, number>();
      for (const r of receipts) {
        receivedMap.set(r.poLineId, (receivedMap.get(r.poLineId) ?? 0) + r.qtyReceived);
      }
      selected = {
        ...purchaseOrder,
        lines: purchaseOrder.lines
          .map((l) => ({
            id: l.id,
            itemCode: l.itemCode,
            name: l.name,
            unit: l.unit,
            qty: l.qty,
            unitPrice: l.unitPrice,
            received: receivedMap.get(l.id) ?? 0,
          }))
          .filter((l) => l.received < l.qty),
      };
    }
  }

  return (
    <div>
      <PageHeader
        title="Record goods receipt"
        subtitle="Confirm what has physically arrived against a purchase order."
      />

      {openOrders.length === 0 ? (
        <Card>
          <EmptyState message="No sent purchase orders to receive against. Send a purchase order first." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4">
            <Card>
              <h3 className="px-5 pt-5 font-display text-base font-semibold text-ink">
                Open purchase orders
              </h3>
              <div className="divide-y divide-line">
                {openOrders.map((order) => {
                  const active = order.id === po;
                  return (
                    <Link
                      key={order.id}
                      href={`/receipts/new?po=${order.id}`}
                      className={`flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors ${
                        active ? "bg-pink/5" : "hover:bg-paper/60"
                      }`}
                    >
                      <div>
                        <p
                          className={`font-mono text-xs font-semibold ${
                            active ? "text-pink" : "text-ink"
                          }`}
                        >
                          {order.code}
                        </p>
                        <p className="text-xs text-ink-soft">{order.vendor.legalName}</p>
                      </div>
                      <span className="font-mono text-xs font-medium text-ink">
                        {formatINR(order.totalAmount)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="xl:col-span-2">
            {selected ? (
              <ReceiptForm
                poId={selected.id}
                poCode={selected.code}
                vendorName={selected.vendor.legalName}
                lines={selected.lines}
              />
            ) : (
              <Card>
                <EmptyState message="Select a purchase order from the list to record receipt of goods." />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatINR, formatDateTime } from "@/lib/format";
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
import PurchaseOrderControls from "@/components/PurchaseOrderControls";
import { PO_SENT, PO_PARTIALLY_RECEIVED } from "@/lib/purchase-orders";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const canWrite = can(user.role, PERMISSIONS.PO_WRITE);
  const canReceive = can(user.role, PERMISSIONS.RECEIPTS_WRITE);

  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      vendor: true,
      requisition: {
        include: { requester: { select: { name: true, email: true } } },
      },
      lines: { orderBy: { itemCode: "asc" } },
      receipts: {
        include: { lines: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!purchaseOrder) notFound();

  const vendor = purchaseOrder.vendor;
  const requisition = purchaseOrder.requisition;
  const taxAmount = purchaseOrder.lines.reduce((s, l) => s + l.taxAmount, 0);
  const subtotal = purchaseOrder.lines.reduce((s, l) => s + l.subtotal, 0);

  const receivedByLine = new Map<string, number>();
  for (const r of purchaseOrder.receipts) {
    for (const l of r.lines) {
      receivedByLine.set(l.poLineId, (receivedByLine.get(l.poLineId) ?? 0) + l.qtyReceived);
    }
  }
  const canRecordReceipt =
    canReceive &&
    [PO_SENT, PO_PARTIALLY_RECEIVED].includes(purchaseOrder.status);
  const openLines = purchaseOrder.lines.filter(
    (l) => (receivedByLine.get(l.id) ?? 0) < l.qty,
  );

  return (
    <div>
      <PageHeader
        title={purchaseOrder.code}
        subtitle={`Purchase order · ${vendor.legalName}`}
        actions={<StatusBadge status={purchaseOrder.status} />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Vendor" subtitle={vendor.code} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Legal name</dt>
                <dd className="mt-1 font-medium text-ink">{vendor.legalName}</dd>
                {vendor.tradeName ? <dd className="text-xs text-ink-soft">{vendor.tradeName}</dd> : null}
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">PAN / GSTIN</dt>
                <dd className="mt-1 font-mono text-xs text-ink">{vendor.pan}</dd>
                <dd className="font-mono text-xs text-ink-soft">{vendor.gstin ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Contact</dt>
                <dd className="mt-1 text-xs text-ink">{vendor.email ?? "—"}</dd>
                <dd className="text-xs text-ink-soft">{vendor.contactPerson ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Currency</dt>
                <dd className="mt-1 font-mono text-xs font-medium text-ink">{vendor.currency}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Payment terms</dt>
                <dd className="mt-1 text-xs text-ink">{purchaseOrder.paymentTermsDays} days</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Sent to</dt>
                <dd className="mt-1 text-xs text-ink">{purchaseOrder.sentTo ?? "—"}</dd>
                <dd className="text-xs text-ink-soft">
                  {purchaseOrder.sentAt ? formatDateTime(purchaseOrder.sentAt) : "Not sent yet"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Line items" subtitle={`${purchaseOrder.lines.length} line${purchaseOrder.lines.length === 1 ? "" : "s"}`} />
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Item</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Received</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">GST</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrder.lines.map((l, index) => {
                  const received = receivedByLine.get(l.id) ?? 0;
                  const complete = received >= l.qty;
                  return (
                    <tr key={l.id} className="hover:bg-paper/40">
                      <Td className="font-mono text-xs text-ink-soft">{index + 1}</Td>
                      <Td>
                        <p className="text-sm font-medium text-ink">{l.name}</p>
                        <p className="font-mono text-[10px] text-ink-soft">
                          {l.itemCode} · HSN {l.hsnSac}
                        </p>
                      </Td>
                      <Td className="text-right font-mono text-sm text-ink">
                        {l.qty} {l.unit}
                      </Td>
                      <Td className="text-right">
                        <span
                          className={`font-mono text-sm ${
                            complete ? "font-semibold text-teal" : "text-ink-soft"
                          }`}
                        >
                          {received}
                        </span>
                        {received > 0 && !complete ? (
                          <Badge tone="amber" >partial</Badge>
                        ) : null}
                      </Td>
                      <Td className="text-right font-mono text-sm text-ink">{formatINR(l.unitPrice)}</Td>
                      <Td className="text-right font-mono text-sm text-ink-soft">{l.taxRatePct}%</Td>
                      <Td className="text-right font-mono text-sm font-medium text-ink">{formatINR(l.lineTotal)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <div className="flex flex-wrap items-end justify-end gap-6 border-t border-line px-5 py-4">
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Subtotal</p>
                <p className="font-mono text-sm font-medium text-ink">{formatINR(subtotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tax</p>
                <p className="font-mono text-sm font-medium text-ink">{formatINR(taxAmount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Total</p>
                <p className="font-display text-lg font-bold text-pink">{formatINR(purchaseOrder.totalAmount)}</p>
              </div>
            </div>
          </Card>

          {purchaseOrder.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="px-5 py-4 text-sm text-ink">{purchaseOrder.notes}</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {canWrite ? (
            <Card className="p-5">
              <h3 className="font-display text-base font-semibold text-ink">Actions</h3>
              <div className="mt-3">
                <PurchaseOrderControls id={id} status={purchaseOrder.status} />
              </div>
              {purchaseOrder.status === "SENT" ? (
                <p className="mt-3 text-xs text-ink-soft">
                  Sent to {purchaseOrder.sentTo ?? "vendor"} — a PDF copy is available.
                </p>
              ) : null}
            </Card>
          ) : null}

          {canRecordReceipt ? (
            <Card className="p-5">
              <h3 className="font-display text-base font-semibold text-ink">Goods receipt</h3>
              <p className="mt-1 text-xs text-ink-soft">
                {openLines.length > 0
                  ? `${openLines.length} line${openLines.length === 1 ? "" : "s"} still pending receipt.`
                  : "All lines received."}
              </p>
              <Link
                href={`/receipts/new?po=${purchaseOrder.id}`}
                className="mt-3 inline-block rounded-md bg-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pink-600"
              >
                Record receipt of goods
              </Link>
            </Card>
          ) : null}

          {purchaseOrder.receipts.length > 0 ? (
            <Card>
              <CardHeader
                title="Goods receipts"
                subtitle={`${purchaseOrder.receipts.length} receipt${purchaseOrder.receipts.length === 1 ? "" : "s"}`}
              />
              <div className="divide-y divide-line">
                {purchaseOrder.receipts.map((r) => (
                  <Link
                    key={r.id}
                    href={`/receipts/${r.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-paper/40"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold text-pink">{r.code}</p>
                      <p className="text-[10px] text-ink-soft">{formatDateTime(r.receivedAt)}</p>
                    </div>
                    <span className="font-mono text-xs text-ink">
                      {r.lines.reduce((s, l) => s + l.qtyReceived, 0)} units
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Source requisition" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Code</dt>
                <dd className="font-mono text-xs font-semibold text-pink">{requisition.code}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Department</dt>
                <dd className="text-xs text-ink">{requisition.department}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Requester</dt>
                <dd className="text-xs text-ink">{requisition.requester.name}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Created</dt>
                <dd className="text-xs text-ink-soft">{formatDateTime(purchaseOrder.createdAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

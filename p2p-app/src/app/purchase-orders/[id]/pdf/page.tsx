import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import PrintButton from "@/components/PrintButton";

function numWord(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function PurchaseOrderPdfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id },
    include: {
      vendor: true,
      requisition: {
        include: { requester: { select: { name: true } } },
      },
      lines: { orderBy: { itemCode: "asc" } },
    },
  });
  if (!purchaseOrder) notFound();

  const vendor = purchaseOrder.vendor;
  const taxAmount = purchaseOrder.lines.reduce((s, l) => s + l.taxAmount, 0);

  return (
    <div className="min-h-full bg-paper">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-6 py-3">
        <p className="font-mono text-xs text-ink-soft">{purchaseOrder.code} · document view</p>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-[820px] px-6 py-10 print:max-w-none print:p-0">
        <div className="rounded-lg border border-line bg-card p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none print:p-0">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="font-display text-2xl font-black uppercase tracking-tight text-ink">
                Purchase Order
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-pink">{purchaseOrder.code}</p>
            </div>
            <div className="text-right text-xs">
              <p className="text-ink-soft">Date</p>
              <p className="mt-0.5 font-mono font-medium text-ink">
                {formatDateTime(purchaseOrder.createdAt)}
              </p>
              <p className="mt-2 text-ink-soft">Status</p>
              <p className="mt-0.5 font-semibold uppercase tracking-wide text-teal">
                {purchaseOrder.status.replace("_", " ")}
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="rounded-md border border-line p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Sold to</p>
              <p className="mt-2 font-display text-sm font-bold text-ink">Meridian Trading Pvt Ltd</p>
              <p className="mt-1 text-xs text-ink-soft">GSTIN · 27AABCM1234F1Z5</p>
            </div>
            <div className="rounded-md border border-line p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Vendor</p>
              <p className="mt-2 font-display text-sm font-bold text-ink">{vendor.legalName}</p>
              {vendor.tradeName ? <p className="text-xs text-ink-soft">{vendor.tradeName}</p> : null}
              <p className="mt-1 text-xs text-ink-soft">PAN · {vendor.pan}</p>
              <p className="text-xs text-ink-soft">{vendor.gstin ? `GSTIN · ${vendor.gstin}` : "GSTIN · —"}</p>
              <p className="text-xs text-ink-soft">{vendor.email ?? ""}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Source requisition</p>
              <p className="mt-1 font-mono font-medium text-ink">{purchaseOrder.requisition.code}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Department</p>
              <p className="mt-1 font-medium text-ink">{purchaseOrder.requisition.department}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Payment terms</p>
              <p className="mt-1 font-medium text-ink">{purchaseOrder.paymentTermsDays} days</p>
            </div>
          </div>

          <table className="mt-8 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">#</th>
                <th className="py-2 pr-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Item</th>
                <th className="py-2 pr-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft">Qty</th>
                <th className="py-2 pr-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft">Rate</th>
                <th className="py-2 pr-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft">GST</th>
                <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft">Total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrder.lines.map((l, index) => (
                <tr key={l.id} className="border-b border-line/60">
                  <td className="py-2.5 pr-2 font-mono text-xs text-ink-soft">{index + 1}</td>
                  <td className="py-2.5 pr-2">
                    <p className="font-medium text-ink">{l.name}</p>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {l.itemCode} · HSN {l.hsnSac}
                    </p>
                  </td>
                  <td className="py-2.5 pr-2 text-right font-mono text-ink">
                    {l.qty} {l.unit}
                  </td>
                  <td className="py-2.5 pr-2 text-right font-mono text-ink">{numWord(l.unitPrice)}</td>
                  <td className="py-2.5 pr-2 text-right font-mono text-ink-soft">{l.taxRatePct}%</td>
                  <td className="py-2.5 text-right font-mono font-medium text-ink">{numWord(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-end justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-ink-soft">
                <span>Subtotal</span>
                <span className="font-mono">{numWord(purchaseOrder.totalAmount - taxAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-ink-soft">
                <span>Tax</span>
                <span className="font-mono">{numWord(taxAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-2 font-display text-base font-bold text-ink">
                <span>Total</span>
                <span className="font-mono">{numWord(purchaseOrder.totalAmount)}</span>
              </div>
            </div>
          </div>

          {purchaseOrder.notes ? (
            <div className="mt-6 border-t border-line pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Notes</p>
              <p className="mt-1 text-sm text-ink">{purchaseOrder.notes}</p>
            </div>
          ) : null}

          <div className="mt-10 flex items-start justify-between gap-8 text-xs text-ink-soft">
            <p>
              Authorised by Meridian Trading Pvt Ltd · {purchaseOrder.requisition.requester.name} ·
              {vendor.legalName}
            </p>
            <p className="shrink-0">PO generated by Meridian P2P</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none; }
          body { background: white; }
          @page { margin: 18mm 16mm; }
        }
      `}</style>
    </div>
  );
}

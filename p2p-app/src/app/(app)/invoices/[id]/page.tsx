import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatINR, formatDateTime } from "@/lib/format";
import { syncLabel } from "@/lib/zoho-sync";
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
import InvoiceControls from "@/components/InvoiceControls";
import { INV_APPROVED, INV_BOOKED, SYNC_FAILED, SYNC_SUCCESS } from "@/lib/invoices";
import { stepsForRule } from "@/lib/workflow";

const MATCH_TONES: Record<string, "teal" | "amber" | "red" | "gray"> = {
  MATCHED: "teal",
  QTY_EXCEEDS_PO: "red",
  QTY_EXCEEDS_GRN: "amber",
  PRICE_VARIANCE: "amber",
  UNMATCHED: "red",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const canWrite = can(user.role, PERMISSIONS.INVOICES_WRITE);
  const canManageZoho = can(user.role, PERMISSIONS.ZOHO_MANAGE);

  const invoice = await db.invoice.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      vendor: true,
      purchaseOrder: {
        include: {
          requisition: { select: { code: true } },
          receipts: { include: { lines: true } },
        },
      },
      lines: { orderBy: { lineNo: "asc" } },
    },
  });
  if (!invoice) notFound();

  const receivedByItem = new Map<string, number>();
  for (const receipt of invoice.purchaseOrder?.receipts ?? []) {
    for (const line of receipt.lines) {
      receivedByItem.set(
        line.itemCode,
        (receivedByItem.get(line.itemCode) ?? 0) + line.qtyReceived,
      );
    }
  }

  const instances = await db.approvalInstance.findMany({
    where: { orgId: user.orgId, docType: "INV", docId: id },
    include: {
      rule: true,
      actions: { include: { actor: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const canSync =
    canManageZoho &&
    (invoice.status === INV_APPROVED ||
      (invoice.status === INV_BOOKED && invoice.syncStatus === SYNC_FAILED) ||
      invoice.syncStatus === SYNC_FAILED);

  const subtotal = invoice.lines.reduce((s, l) => s + l.subtotal, 0);
  const taxAmount = invoice.lines.reduce((s, l) => s + l.taxAmount, 0);

  return (
    <div>
      <PageHeader
        title={invoice.code}
        subtitle={`Vendor invoice · ${invoice.vendor.legalName}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={invoice.status} />
            <Badge
              tone={invoice.syncStatus === SYNC_SUCCESS ? "teal" : invoice.syncStatus === SYNC_FAILED ? "red" : invoice.syncStatus === "PENDING" ? "amber" : "gray"}
            >
              {syncLabel(invoice.syncStatus)}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Vendor bill" subtitle={invoice.invoiceNumber} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Vendor</dt>
                <dd className="mt-1 font-medium text-ink">{invoice.vendor.legalName}</dd>
                <dd className="font-mono text-xs text-ink-soft">{invoice.vendor.gstin ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Invoice date</dt>
                <dd className="mt-1 text-xs text-ink">{formatDateTime(invoice.invoiceDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Due date</dt>
                <dd className="mt-1 text-xs text-ink">{invoice.dueDate ? formatDateTime(invoice.dueDate) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">TDS</dt>
                <dd className="mt-1 text-xs text-ink">
                  {invoice.tdsRate ? `${invoice.tdsSection ?? "—"} @ ${invoice.tdsRate}%` : "Not applicable"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Source PO</dt>
                <dd className="mt-1 text-xs text-ink">
                  {invoice.purchaseOrder ? (
                    <Link
                      href={`/purchase-orders/${invoice.purchaseOrder.id}`}
                      className="font-mono text-xs font-semibold text-pink hover:underline"
                    >
                      {invoice.purchaseOrder.code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Zoho bill</dt>
                <dd className="mt-1 font-mono text-xs text-ink">
                  {invoice.zohoBillId ? (
                    <>
                      {invoice.zohoBillNumber ?? invoice.zohoBillId}
                    </>
                  ) : (
                    "Not booked"
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Line items"
              subtitle={`${invoice.lines.length} line${invoice.lines.length === 1 ? "" : "s"} · match status per line`}
            />
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
                  <Th>Match</Th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l, index) => {
                  const received = receivedByItem.get(l.itemCode) ?? 0;
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
                      <Td className="text-right font-mono text-sm text-ink-soft">
                        {received}
                      </Td>
                      <Td className="text-right font-mono text-sm text-ink">{formatINR(l.unitPrice)}</Td>
                      <Td className="text-right font-mono text-sm text-ink-soft">{l.taxRatePct}%</Td>
                      <Td className="text-right font-mono text-sm font-medium text-ink">{formatINR(l.lineTotal)}</Td>
                      <Td>
                        <Badge tone={MATCH_TONES[l.matchStatus] ?? "gray"}>
                          {l.matchStatus.replace("_", " ")}
                        </Badge>
                        {l.matchNotes ? (
                          <p className="mt-1 max-w-[180px] text-[10px] text-ink-soft">{l.matchNotes}</p>
                        ) : null}
                      </Td>
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
              {invoice.tdsAmount > 0 ? (
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">TDS</p>
                  <p className="font-mono text-sm font-medium text-ink">−{formatINR(invoice.tdsAmount)}</p>
                </div>
              ) : null}
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Total</p>
                <p className="font-display text-lg font-bold text-pink">{formatINR(invoice.totalAmount)}</p>
              </div>
            </div>
          </Card>

          {invoice.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="px-5 py-4 text-sm text-ink">{invoice.notes}</p>
            </Card>
          ) : null}

          {instances.length > 0 ? (
            <Card>
              <CardHeader title="Approval trail" />
              <div className="space-y-3 px-5 py-4">
                {instances.map((instance) => {
                  const steps = stepsForRule(instance.rule);
                  return (
                    <div key={instance.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={instance.status === "PENDING" ? "amber" : instance.status === "APPROVED" ? "teal" : "red"}>
                          Step {instance.currentStep} of {steps.length || 1}
                        </Badge>
                        <span className="text-xs text-ink-soft">{instance.status.replace("_", " ")}</span>
                        <span className="font-mono text-xs text-ink-soft">{formatDateTime(instance.createdAt)}</span>
                      </div>
                      {instance.actions.length > 0 ? (
                        <p className="mt-1 text-xs text-ink-soft">
                          {instance.actions
                            .map((a) => `${a.actor.name} (${a.decision.toLowerCase()})`)
                            .join(" → ")}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {canWrite ? (
            <Card className="p-5">
              <h3 className="font-display text-base font-semibold text-ink">Actions</h3>
              <div className="mt-3">
                <InvoiceControls id={id} status={invoice.status} canSync={canSync} />
              </div>
              {invoice.syncError ? (
                <p className="mt-3 rounded-md bg-red-950/60 px-3 py-2 text-xs text-red-400">
                  {invoice.syncError}
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Timeline" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Received</dt>
                <dd className="text-xs text-ink">{formatDateTime(invoice.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Matched</dt>
                <dd className="text-xs text-ink">{invoice.matchedAt ? formatDateTime(invoice.matchedAt) : "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Submitted</dt>
                <dd className="text-xs text-ink">{invoice.submittedAt ? formatDateTime(invoice.submittedAt) : "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Decided</dt>
                <dd className="text-xs text-ink">{invoice.decidedAt ? formatDateTime(invoice.decidedAt) : "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Booked</dt>
                <dd className="text-xs text-ink">{invoice.bookedAt ? formatDateTime(invoice.bookedAt) : "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Paid</dt>
                <dd className="text-xs text-ink">
                  {invoice.paidAt ? `${formatDateTime(invoice.paidAt)}${invoice.paymentRef ? ` · ${invoice.paymentRef}` : ""}` : "—"}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

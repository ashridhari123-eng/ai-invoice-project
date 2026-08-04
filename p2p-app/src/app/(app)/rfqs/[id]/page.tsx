import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatINR, formatDate, formatDateTime } from "@/lib/format";
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
import QuoteForm from "@/components/QuoteForm";
import ComparisonPanel from "@/components/ComparisonPanel";

export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const canWrite = can(user.role, PERMISSIONS.RFQ_WRITE);

  const rfq = await db.rfq.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      requisition: {
        include: { requester: { select: { name: true } } },
      },
      lines: { orderBy: { lineNo: "asc" } },
      quotes: {
        include: {
          vendor: {
            select: {
              id: true,
              legalName: true,
              code: true,
              rating: true,
              currency: true,
              paymentTermsDays: true,
            },
          },
          lines: { orderBy: { lineNo: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
      awards: {
        include: { vendor: { select: { id: true, legalName: true } } },
        orderBy: { awardedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!rfq) notFound();

  const quotes = rfq.quotes.map((q) => ({
    id: q.id,
    vendorId: q.vendorId,
    vendorName: q.vendor.legalName,
    vendorCode: q.vendor.code,
    rating: q.vendor.rating,
    status: q.status,
    currency: q.currency,
    freight: q.freight,
    packing: q.packing,
    otherCharges: q.otherCharges,
    advancePct: q.advancePct,
    creditDays: q.creditDays,
    deliveryDays: q.deliveryDays,
    warrantyMonths: q.warrantyMonths,
    validityDays: q.validityDays,
    notes: q.notes,
    totalAmount: q.totalAmount,
    totalLandedAmount: q.totalLandedAmount,
    cashCost: q.cashCost,
    comparableTotal: Math.round((q.totalLandedAmount + q.cashCost) * 100) / 100,
    landedUnitCosts: q.lines.map((l) => l.landedUnitCost),
    lines: q.lines.map((l) => ({
      id: l.id,
      rfqLineId: l.rfqLineId,
      itemCode: l.itemCode,
      name: l.name,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      subtotal: l.subtotal,
      landedUnitCost: l.landedUnitCost,
      lineTotal: l.lineTotal,
    })),
  }));

  const evaluation = rfq.evaluations[0]
    ? {
        scoresJson: rfq.evaluations[0].scoresJson,
        recommendationJson: rfq.evaluations[0].recommendationJson,
        createdAt: rfq.evaluations[0].createdAt,
      }
    : null;

  const invitedQuotes = quotes.filter((q) => q.status === "INVITED");
  const submittedQuotes = quotes.filter((q) => q.status === "SUBMITTED");

  return (
    <div>
      <PageHeader
        title={rfq.code}
        subtitle={`Request for quote · ${rfq.category ?? "General procurement"}`}
        actions={<StatusBadge status={rfq.status} />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Source requisition"
              subtitle={rfq.department}
              actions={
                <Link
                  href={`/requisitions/${rfq.requisitionId}`}
                  className="text-xs font-semibold text-pink hover:underline"
                >
                  {rfq.requisition.code} →
                </Link>
              }
            />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Requester</dt>
                <dd className="mt-1 text-xs text-ink">{rfq.requisition.requester.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Need by</dt>
                <dd className="mt-1 text-xs text-ink">
                  {rfq.needByDate ? formatDate(rfq.needByDate) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Created</dt>
                <dd className="mt-1 text-xs text-ink-soft">{formatDateTime(rfq.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Lines</dt>
                <dd className="mt-1 text-xs text-ink">{rfq.lines.length}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Line items" subtitle="Estimated quantities from the requisition" />
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Item</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Est. rate</Th>
                </tr>
              </thead>
              <tbody>
                {rfq.lines.map((l, index) => (
                  <tr key={l.id} className="hover:bg-paper/40">
                    <Td className="font-mono text-xs text-ink-soft">{index + 1}</Td>
                    <Td>
                      <p className="text-sm font-medium text-ink">{l.name}</p>
                      <p className="font-mono text-[10px] text-ink-soft">{l.itemCode}</p>
                    </Td>
                    <Td className="text-right font-mono text-sm text-ink">
                      {l.qty} {l.unit}
                    </Td>
                    <Td className="text-right font-mono text-sm text-ink">{formatINR(l.unitPrice)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {submittedQuotes.map((q) => (
            <Card key={q.id}>
              <CardHeader
                title={q.vendorName}
                subtitle={`${q.vendorCode} · rating ${q.rating} · ${q.currency}`}
                actions={
                  <div className="flex items-center gap-2">
                    <Badge tone={q.creditDays > 0 ? "teal" : "gray"}>
                      {q.creditDays}d credit
                    </Badge>
                    <Badge tone={q.deliveryDays > 0 ? "teal" : "gray"}>
                      {q.deliveryDays}d delivery
                    </Badge>
                  </div>
                }
              />
              <Table>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Item</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Unit price</Th>
                    <Th className="text-right">Landed/unit</Th>
                    <Th className="text-right">Line total</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.lines.map((l, index) => (
                    <tr key={l.id} className="hover:bg-paper/40">
                      <Td className="font-mono text-xs text-ink-soft">{index + 1}</Td>
                      <Td>
                        <p className="text-sm font-medium text-ink">{l.name}</p>
                        <p className="font-mono text-[10px] text-ink-soft">{l.itemCode}</p>
                      </Td>
                      <Td className="text-right font-mono text-sm text-ink">
                        {l.qty} {l.unit}
                      </Td>
                      <Td className="text-right font-mono text-sm text-ink">{formatINR(l.unitPrice)}</Td>
                      <Td className="text-right font-mono text-sm text-ink-soft">
                        {formatINR(l.landedUnitCost)}
                      </Td>
                      <Td className="text-right font-mono text-sm font-medium text-ink">
                        {formatINR(l.lineTotal)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="flex flex-wrap items-center justify-end gap-6 border-t border-line px-5 py-4">
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Freight + charges</p>
                  <p className="font-mono text-sm text-ink">
                    {formatINR(q.freight + q.packing + q.otherCharges)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Cash cost</p>
                  <p className="font-mono text-sm text-ink">{formatINR(q.cashCost)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Comparable total</p>
                  <p className="font-display text-lg font-bold text-pink">{formatINR(q.comparableTotal)}</p>
                </div>
              </div>
              {q.notes ? (
                <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">{q.notes}</p>
              ) : null}
            </Card>
          ))}

          {invitedQuotes.map((q) => (
            <Card key={q.id}>
              <CardHeader
                title={`Record quote from ${q.vendorName}`}
                subtitle={`${q.vendorCode} · rating ${q.rating}`}
              />
              <div className="px-5 py-4">
                <QuoteForm
                  rfqId={rfq.id}
                  quoteId={q.id}
                  vendorName={q.vendorName}
                  lines={rfq.lines.map((l) => ({
                    id: l.id,
                    itemCode: l.itemCode,
                    name: l.name,
                    qty: l.qty,
                    unit: l.unit,
                    unitPrice: l.unitPrice,
                  }))}
                  onDone={() => {}}
                />
              </div>
            </Card>
          ))}

          {rfq.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="px-5 py-4 text-sm text-ink">{rfq.notes}</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <ComparisonPanel
            rfqId={rfq.id}
            initialStatus={rfq.status}
            initialQuotes={quotes}
            initialEvaluation={
              evaluation
                ? {
                    scores: JSON.parse(evaluation.scoresJson) as {
                      quoteId: string;
                      vendorName: string;
                      comparableTotal: number;
                      landedCost: number;
                      delivery: number;
                      paymentTerms: number;
                      vendorRating: number;
                      total: number;
                    }[],
                    recommendation: JSON.parse(evaluation.recommendationJson) as {
                      recommended_vendor: string;
                      reasoning: string;
                      risks: string[];
                      negotiation_tips: string[];
                      mock?: boolean;
                    },
                  }
                : null
            }
            initialAward={
              rfq.awards[0]
                ? {
                    id: rfq.awards[0].id,
                    quoteId: rfq.awards[0].quoteId,
                    vendorId: rfq.awards[0].vendorId,
                    vendorName: rfq.awards[0].vendor.legalName,
                    overrideReason: rfq.awards[0].overrideReason,
                    awardedAt: rfq.awards[0].awardedAt.toISOString(),
                    poId: rfq.awards[0].poId,
                  }
                : null
            }
            canWrite={canWrite}
            needByDate={rfq.needByDate}
          />
        </div>
      </div>
    </div>
  );
}

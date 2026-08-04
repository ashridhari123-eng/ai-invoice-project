import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { RFQ_EVALUATING, scoreQuotes } from "@/lib/rfq";
import { recommendAward, type QuoteContextRow } from "@/lib/llm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.RFQ_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const rfq = await db.rfq.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      quotes: {
        where: { status: "SUBMITTED" },
        include: {
          vendor: { select: { id: true, legalName: true, rating: true } },
          lines: { orderBy: { lineNo: "asc" } },
        },
      },
    },
  });
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  if (rfq.quotes.length === 0) {
    return NextResponse.json(
      { error: "At least one submitted quote is required to evaluate" },
      { status: 400 },
    );
  }

  const quoteRows = rfq.quotes.map((q) => ({
    quoteId: q.id,
    vendorId: q.vendorId,
    vendorName: q.vendor.legalName,
    comparableTotal: Math.round((q.totalLandedAmount + q.cashCost) * 100) / 100,
    deliveryDays: q.deliveryDays,
    creditDays: q.creditDays,
    vendorRating: q.vendor.rating,
  }));

  const scores = scoreQuotes(
    quoteRows.map((q) => ({
      comparableTotal: q.comparableTotal,
      deliveryDays: q.deliveryDays,
      creditDays: q.creditDays,
      vendorRating: q.vendorRating,
    })),
  );

  const context: QuoteContextRow[] = rfq.quotes.map((q, i) => ({
    vendorName: q.vendor.legalName,
    landedUnitCosts: q.lines.map((l) => l.landedUnitCost),
    comparableTotal: quoteRows[i].comparableTotal,
    deliveryDays: q.deliveryDays,
    creditDays: q.creditDays,
    advancePct: q.advancePct,
    rating: q.vendor.rating,
    score: scores[i].total,
    validityDays: q.validityDays || null,
    notes: q.notes,
  }));

  const { recommendation, mock } = await recommendAward(context);

  const scoresJson = JSON.stringify(
    rfq.quotes.map((q, i) => ({
      quoteId: q.id,
      vendorId: q.vendorId,
      vendorName: q.vendor.legalName,
      comparableTotal: quoteRows[i].comparableTotal,
      landedUnitCosts: q.lines.map((l) => l.landedUnitCost),
      ...scores[i],
    })),
  );
  const recommendationJson = JSON.stringify({ ...recommendation, mock });

  const evaluation = await db.$transaction(async (tx) => {
    const created = await tx.rfqEvaluation.create({
      data: {
        rfqId: id,
        scoresJson,
        recommendationJson,
        evaluatorId: user.id,
      },
    });
    await tx.rfq.update({ where: { id }, data: { status: RFQ_EVALUATING } });
    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "RFQ",
      entityId: id,
      action: "EVALUATE",
      after: {
        quotes: rfq.quotes.length,
        recommended: recommendation.recommended_vendor,
        mock,
      },
      ip: clientIp(request),
    });
    return created;
  });

  return NextResponse.json({
    evaluation: {
      id: evaluation.id,
      scores: JSON.parse(scoresJson),
      recommendation: JSON.parse(recommendationJson),
      mock,
      quotesById: Object.fromEntries(
        rfq.quotes.map((q) => [q.id, { vendorName: q.vendor.legalName }]),
      ),
      context,
    },
  });
}

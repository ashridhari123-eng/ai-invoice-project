import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.RFQ_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const rfq = await db.rfq.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      requisition: {
        select: { id: true, code: true, requester: { select: { name: true } } },
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
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  }

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

  return NextResponse.json({
    rfq: {
      id: rfq.id,
      code: rfq.code,
      department: rfq.department,
      category: rfq.category,
      needByDate: rfq.needByDate,
      status: rfq.status,
      notes: rfq.notes,
      createdAt: rfq.createdAt,
      requisition: rfq.requisition,
      lines: rfq.lines,
      quotes,
      evaluation: rfq.evaluations[0]
        ? {
            scoresJson: rfq.evaluations[0].scoresJson,
            recommendationJson: rfq.evaluations[0].recommendationJson,
            createdAt: rfq.evaluations[0].createdAt,
          }
        : null,
      award: rfq.awards[0] ?? null,
    },
  });
}

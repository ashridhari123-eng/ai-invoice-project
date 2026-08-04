import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { RFQ_OPEN, computeLandedQuote } from "@/lib/rfq";

const SubmitQuoteSchema = z.object({
  quoteId: z.string().min(1),
  unitPrices: z.record(z.string().min(1), z.coerce.number().nonnegative()),
  freight: z.coerce.number().nonnegative().default(0),
  packing: z.coerce.number().nonnegative().default(0),
  otherCharges: z.coerce.number().nonnegative().default(0),
  advancePct: z.coerce.number().min(0).max(100).default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  deliveryDays: z.coerce.number().int().min(0).max(730).default(0),
  warrantyMonths: z.coerce.number().int().min(0).max(120).default(0),
  validityDays: z.coerce.number().int().min(0).max(365).default(0),
  notes: z.string().optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.RFQ_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = SubmitQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const updated = await db.$transaction(async (tx) => {
      const rfq = await tx.rfq.findFirst({ where: { id, orgId: user.orgId } });
      if (!rfq) throw new Error("RFQ not found");
      if (rfq.status !== RFQ_OPEN) {
        throw new Error(
          `A ${rfq.status.replace("_", " ").toLowerCase()} RFQ cannot accept quotes`,
        );
      }

      const quote = await tx.rfqQuote.findFirst({
        where: { id: data.quoteId, rfqId: id },
        include: { lines: true, vendor: { select: { legalName: true } } },
      });
      if (!quote) throw new Error("Quote not found on this RFQ");
      if (quote.status === "SUBMITTED" && quote.lines.length > 0) {
        throw new Error("This quote has already been submitted");
      }

      const rfqLines = await tx.rfqLine.findMany({
        where: { rfqId: id },
        orderBy: { lineNo: "asc" },
      });
      if (rfqLines.length === 0) throw new Error("RFQ has no lines");

      const priced = rfqLines.map((line) => ({
        rfqLineId: line.id,
        itemCode: line.itemCode,
        name: line.name,
        qty: line.qty,
        unit: line.unit,
        unitPrice: data.unitPrices[line.id],
      }));
      const missing = priced.find((p) => p.unitPrice === undefined);
      if (missing) {
        throw new Error(`Missing unit price for ${missing.itemCode}`);
      }

      const landed = computeLandedQuote(
        priced.map((p) => ({ qty: p.qty, unitPrice: p.unitPrice })),
        {
          freight: data.freight,
          packing: data.packing,
          otherCharges: data.otherCharges,
          advancePct: data.advancePct,
          creditDays: data.creditDays,
          deliveryDays: data.deliveryDays,
          warrantyMonths: data.warrantyMonths,
          validityDays: data.validityDays,
        },
      );

      await tx.rfqQuoteLine.deleteMany({ where: { quoteId: quote.id } });

      const quoteLines = priced.map((p, index) => {
        const subtotal = Math.round(p.qty * p.unitPrice * 100) / 100;
        return {
          quoteId: quote.id,
          rfqLineId: p.rfqLineId,
          lineNo: index + 1,
          itemCode: p.itemCode,
          name: p.name,
          qty: p.qty,
          unit: p.unit,
          unitPrice: p.unitPrice,
          subtotal,
          landedUnitCost: landed.landedUnitCosts[index],
          lineTotal: subtotal,
        };
      });
      await tx.rfqQuoteLine.createMany({ data: quoteLines });

      const saved = await tx.rfqQuote.update({
        where: { id: quote.id },
        data: {
          status: "SUBMITTED",
          freight: data.freight,
          packing: data.packing,
          otherCharges: data.otherCharges,
          advancePct: data.advancePct,
          creditDays: data.creditDays,
          deliveryDays: data.deliveryDays,
          warrantyMonths: data.warrantyMonths,
          validityDays: data.validityDays,
          notes: data.notes?.trim() || null,
          totalAmount: landed.goodsTotal,
          totalLandedAmount: landed.totalLanded,
          cashCost: landed.cashCost,
        },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "RFQ",
        entityId: id,
        action: "UPDATE",
        after: {
          quoteId: data.quoteId,
          vendor: quote.vendor.legalName,
          totalLanded: landed.totalLanded,
        },
        ip: clientIp(request),
      });

      return saved;
    });

    return NextResponse.json({ quote: updated });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

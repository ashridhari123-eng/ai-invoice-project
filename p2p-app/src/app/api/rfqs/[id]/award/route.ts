import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { RFQ_AWARDED } from "@/lib/rfq";
import { PO_DRAFT } from "@/lib/purchase-orders";
import { PR_APPROVED } from "@/lib/requisitions";
import { nextDocNumber, DOC_ENTITY_PO } from "@/lib/numbers";
import { notifyUser } from "@/lib/workflow";
import { NOTIFY_PO_CREATED } from "@/lib/purchase-orders";

const AwardSchema = z.object({
  quoteId: z.string().min(1),
  overrideReason: z.string().optional().nullable(),
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

  const parsed = AwardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const rfq = await tx.rfq.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          lines: { orderBy: { lineNo: "asc" } },
          evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
          awards: true,
        },
      });
      if (!rfq) throw new Error("RFQ not found");
      if (rfq.awards.length > 0) throw new Error("This RFQ has already been awarded");

      const quote = await tx.rfqQuote.findFirst({
        where: { id: data.quoteId, rfqId: id },
        include: {
          vendor: true,
          lines: { orderBy: { lineNo: "asc" } },
        },
      });
      if (!quote) throw new Error("Quote not found on this RFQ");
      if (quote.status !== "SUBMITTED") throw new Error("Only submitted quotes can be awarded");

      const recommendation = rfq.evaluations[0]
        ? (JSON.parse(rfq.evaluations[0].recommendationJson) as {
            recommended_vendor?: string;
          })
        : null;
      const followsRecommendation =
        !recommendation?.recommended_vendor ||
        recommendation.recommended_vendor === quote.vendor.legalName;
      if (!followsRecommendation && !data.overrideReason?.trim()) {
        throw new Error(
          `Award differs from the AI recommendation (${recommendation?.recommended_vendor}). An override reason is required.`,
        );
      }

      const requisition = await tx.purchaseRequisition.findFirst({
        where: { id: rfq.requisitionId, orgId: user.orgId },
        include: { lines: { orderBy: { lineNo: "asc" } } },
      });
      if (!requisition) throw new Error("Source requisition not found");
      if (requisition.status !== PR_APPROVED) {
        throw new Error("Source requisition is no longer approved");
      }
      const existingPo = await tx.purchaseOrder.findFirst({
        where: { orgId: user.orgId, requisitionId: requisition.id },
      });
      if (existingPo) {
        throw new Error(`${requisition.code} already has a purchase order`);
      }

      const rfqLineByRequisitionLine = new Map<string, string>();
      for (const line of rfq.lines) {
        if (line.requisitionLineId) {
          rfqLineByRequisitionLine.set(line.requisitionLineId, line.id);
        }
      }
      const unitPriceByRfqLine = new Map(
        quote.lines.map((l) => [l.rfqLineId ?? "", l.unitPrice]),
      );

      const poLines = requisition.lines.map((rl, index) => {
        const rfqLineId = rfqLineByRequisitionLine.get(rl.id);
        const quotedPrice = rfqLineId ? unitPriceByRfqLine.get(rfqLineId) : undefined;
        const unitPrice = quotedPrice !== undefined ? quotedPrice : rl.unitPrice;
        const subtotal = Math.round(rl.qty * unitPrice * 100) / 100;
        const taxAmount = Math.round((subtotal * rl.taxRatePct) / 100 * 100) / 100;
        const lineTotal = Math.round((subtotal + taxAmount) * 100) / 100;
        return {
          lineNo: index + 1,
          requisitionLineId: rl.id,
          itemId: rl.itemId,
          itemCode: rl.itemCode,
          name: rl.name,
          hsnSac: rl.hsnSac,
          qty: rl.qty,
          unit: rl.unit,
          unitPrice,
          taxRatePct: rl.taxRatePct,
          subtotal,
          taxAmount,
          lineTotal,
        };
      });

      const subtotal = Math.round(poLines.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
      const taxAmount = Math.round(poLines.reduce((s, l) => s + l.taxAmount, 0) * 100) / 100;
      const totalAmount = Math.round(poLines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;

      const poCode = await nextDocNumber(tx, user.orgId, DOC_ENTITY_PO);
      const po = await tx.purchaseOrder.create({
        data: {
          orgId: user.orgId,
          code: poCode,
          requisitionId: requisition.id,
          vendorId: quote.vendorId,
          status: PO_DRAFT,
          currency: quote.vendor.currency,
          paymentTermsDays: quote.creditDays || quote.vendor.paymentTermsDays,
          notes: quote.notes?.trim() || null,
          subtotal,
          taxAmount,
          totalAmount,
          createdById: user.id,
          lines: { create: poLines },
        },
      });

      const award = await tx.rfqAward.create({
        data: {
          rfqId: id,
          quoteId: quote.id,
          vendorId: quote.vendorId,
          overrideReason: data.overrideReason?.trim() || null,
          awardedById: user.id,
          poId: po.id,
        },
      });

      await tx.rfq.update({ where: { id }, data: { status: RFQ_AWARDED } });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "RFQ",
        entityId: id,
        action: "AWARD",
        after: {
          quoteId: quote.id,
          vendor: quote.vendor.legalName,
          override: Boolean(award.overrideReason),
          poCode,
        },
        ip: clientIp(request),
      });

      await notifyUser(tx, {
        orgId: user.orgId,
        userId: requisition.requesterId,
        type: NOTIFY_PO_CREATED,
        title: "Purchase order created from RFQ award",
        message: `${poCode} (₹${Math.round(totalAmount).toLocaleString("en-IN")}) was created for ${requisition.code} from the award to ${quote.vendor.legalName}.`,
        docType: "PO",
        docId: po.id,
      });

      return { award, po };
    });

    return NextResponse.json({ award: result.award, purchaseOrder: result.po }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

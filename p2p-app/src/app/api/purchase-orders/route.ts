import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { nextDocNumber, DOC_ENTITY_PO } from "@/lib/numbers";
import { PR_APPROVED } from "@/lib/requisitions";
import {
  PO_DRAFT,
  NOTIFY_PO_CREATED,
} from "@/lib/purchase-orders";
import { notifyUser } from "@/lib/workflow";

const CreatePOSchema = z.object({
  requisitionId: z.string().min(1, "Requisition is required"),
  vendorId: z.string().min(1, "Vendor is required"),
  paymentTermsDays: z.coerce.number().int().min(0).max(180).optional(),
  notes: z.string().optional().nullable(),
});

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.PO_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { orgId: user.orgId },
    include: {
      vendor: { select: { code: true, legalName: true, email: true, currency: true } },
      requisition: { select: { code: true, department: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ purchaseOrders });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.PO_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = CreatePOSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const po = await db.$transaction(async (tx) => {
      const requisition = await tx.purchaseRequisition.findFirst({
        where: { id: data.requisitionId, orgId: user.orgId },
        include: { lines: { orderBy: { lineNo: "asc" } } },
      });
      if (!requisition) throw new Error("Requisition not found");
      if (requisition.status !== PR_APPROVED) {
        throw new Error("Only approved requisitions can be converted to a purchase order");
      }

      const existing = await tx.purchaseOrder.findFirst({
        where: { orgId: user.orgId, requisitionId: requisition.id },
      });
      if (existing) {
        throw new Error(`A purchase order already exists for ${requisition.code}`);
      }

      const vendor = await tx.vendor.findFirst({
        where: { id: data.vendorId, orgId: user.orgId, status: "ACTIVE" },
      });
      if (!vendor) throw new Error("Select an active vendor");

      const subtotal = Math.round(
        requisition.lines.reduce((sum, l) => sum + l.subtotal, 0) * 100,
      ) / 100;
      const taxAmount = Math.round(
        requisition.lines.reduce((sum, l) => sum + l.taxAmount, 0) * 100,
      ) / 100;
      const totalAmount = Math.round(
        requisition.lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100,
      ) / 100;

      const code = await nextDocNumber(tx, user.orgId, DOC_ENTITY_PO);
      const created = await tx.purchaseOrder.create({
        data: {
          orgId: user.orgId,
          code,
          requisitionId: requisition.id,
          vendorId: vendor.id,
          status: PO_DRAFT,
          currency: vendor.currency,
          paymentTermsDays: data.paymentTermsDays ?? vendor.paymentTermsDays,
          notes: data.notes?.trim() || null,
          subtotal,
          taxAmount,
          totalAmount,
          createdById: user.id,
          lines: {
            create: requisition.lines.map((l) => ({
              requisitionLineId: l.id,
              itemId: l.itemId,
              itemCode: l.itemCode,
              name: l.name,
              hsnSac: l.hsnSac,
              qty: l.qty,
              unit: l.unit,
              unitPrice: l.unitPrice,
              taxRatePct: l.taxRatePct,
              subtotal: l.subtotal,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true, vendor: true, requisition: true },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "PO",
        entityId: created.id,
        action: "CREATE",
        after: {
          code,
          requisitionCode: requisition.code,
          vendorCode: vendor.code,
          totalAmount,
        },
        ip: clientIp(request),
      });

      await notifyUser(tx, {
        orgId: user.orgId,
        userId: requisition.requesterId,
        type: NOTIFY_PO_CREATED,
        title: "Purchase order created",
        message: `${code} (₹${Math.round(totalAmount).toLocaleString("en-IN")}) was created for ${requisition.code}.`,
        docType: "PO",
        docId: created.id,
      });

      return created;
    });

    return NextResponse.json({ purchaseOrder: po }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

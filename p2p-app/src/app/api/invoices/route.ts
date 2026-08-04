import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { nextDocNumber, DOC_ENTITY_INVOICE } from "@/lib/numbers";
import { PO_SENT } from "@/lib/purchase-orders";
import { notifyUser } from "@/lib/workflow";
import {
  INV_RECEIVED,
  SYNC_NONE,
  NOTIFY_INV_CREATED,
  computeTdsAmount,
  computeTotals,
} from "@/lib/invoices";

const CreateInvoiceSchema = z.object({
  poId: z.string().min(1, "Purchase order is required"),
  invoiceNumber: z.string().trim().min(1, "Vendor invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().optional().nullable(),
  tdsSection: z.string().optional().nullable(),
  tdsRate: z.coerce.number().min(0).max(30).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.INVOICES_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const invoices = await db.invoice.findMany({
    where: { orgId: user.orgId },
    include: {
      vendor: { select: { code: true, legalName: true, gstin: true } },
      purchaseOrder: { select: { code: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.INVOICES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const invoice = await db.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: { id: data.poId, orgId: user.orgId },
        include: {
          vendor: true,
          lines: { orderBy: { itemCode: "asc" } },
          requisition: { select: { requesterId: true, code: true } },
        },
      });
      if (!purchaseOrder) throw new Error("Purchase order not found");
      if (purchaseOrder.status !== PO_SENT) {
        throw new Error("Only sent purchase orders can be invoiced");
      }

      const existing = await tx.invoice.findFirst({
        where: {
          orgId: user.orgId,
          invoiceNumber: data.invoiceNumber,
        },
      });
      if (existing) {
        throw new Error(
          `Invoice ${data.invoiceNumber} has already been recorded (${existing.code})`,
        );
      }

      const lines = purchaseOrder.lines.map((l) => ({
        poLineId: l.id,
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
      }));

      const totals = computeTotals(lines);
      const tdsRate = data.tdsRate ?? null;
      const tdsAmount = computeTdsAmount(totals.subtotal, tdsRate);
      const totalAmount = Math.round((totals.totalAmount + tdsAmount) * 100) / 100;

      const code = await nextDocNumber(tx, user.orgId, DOC_ENTITY_INVOICE);
      const created = await tx.invoice.create({
        data: {
          orgId: user.orgId,
          code,
          vendorId: purchaseOrder.vendorId,
          poId: purchaseOrder.id,
          invoiceNumber: data.invoiceNumber,
          invoiceDate: new Date(`${data.invoiceDate}T00:00:00`),
          dueDate: data.dueDate
            ? new Date(`${data.dueDate}T00:00:00`)
            : null,
          status: INV_RECEIVED,
          currency: purchaseOrder.currency,
          notes: data.notes?.trim() || null,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          tdsAmount,
          tdsSection: data.tdsSection?.trim() || null,
          tdsRate,
          totalAmount,
          syncStatus: SYNC_NONE,
          createdById: user.id,
          lines: { create: lines.map((l, index) => ({ ...l, lineNo: index + 1 })) },
        },
        include: { vendor: true, purchaseOrder: true, lines: true },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "INVOICE",
        entityId: created.id,
        action: "CREATE",
        after: {
          code,
          invoiceNumber: data.invoiceNumber,
          poCode: purchaseOrder.code,
          vendorCode: purchaseOrder.vendor.code,
          totalAmount,
        },
        ip: clientIp(request),
      });

      await notifyUser(tx, {
        orgId: user.orgId,
        userId: purchaseOrder.requisition.requesterId,
        type: NOTIFY_INV_CREATED,
        title: "Vendor invoice received",
        message: `${data.invoiceNumber} (₹${Math.round(totalAmount).toLocaleString("en-IN")}) was recorded against ${purchaseOrder.code}.`,
        docType: "INV",
        docId: created.id,
      });

      return created;
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

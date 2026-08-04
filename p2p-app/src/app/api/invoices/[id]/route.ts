import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  INV_RECEIVED,
  INV_MATCHED,
  computeTdsAmount,
  computeTotals,
} from "@/lib/invoices";

const UpdateLineSchema = z.object({
  id: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  taxRatePct: z.coerce.number().min(0).max(100),
});

const UpdateInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  dueDate: z.string().optional().nullable(),
  tdsSection: z.string().optional().nullable(),
  tdsRate: z.coerce.number().min(0).max(30).optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(UpdateLineSchema).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.INVOICES_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const invoice = await db.invoice.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      vendor: true,
      purchaseOrder: {
        include: { requisition: { select: { code: true } } },
      },
      lines: { orderBy: { lineNo: "asc" } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ invoice });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.INVOICES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = UpdateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const invoice = await db.invoice.findFirst({
    where: { id, orgId: user.orgId },
    include: { lines: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (
    ![INV_RECEIVED, INV_MATCHED].includes(invoice.status)
  ) {
    return NextResponse.json(
      { error: "Only received or matched invoices can be edited" },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const before = { status: invoice.status };

  try {
    const updated = await db.$transaction(async (tx) => {
      let subtotal = invoice.subtotal;
      let taxAmount = invoice.taxAmount;

      if (data.lines && data.lines.length > 0) {
        const existingById = new Map(invoice.lines.map((l) => [l.id, l]));
        for (const line of data.lines) {
          const current = existingById.get(line.id);
          if (!current) throw new Error(`Unknown line ${line.id}`);
          if (![INV_RECEIVED, INV_MATCHED].includes(invoice.status)) {
            throw new Error("Lines can only be edited before approval");
          }
          const sub = Math.round(line.qty * line.unitPrice * 100) / 100;
          const tax = Math.round(sub * line.taxRatePct * 100) / 10000;
          const lineTotal = Math.round((sub + tax) * 100) / 100;
          await tx.invoiceLine.update({
            where: { id: line.id },
            data: {
              qty: line.qty,
              unitPrice: line.unitPrice,
              taxRatePct: line.taxRatePct,
              subtotal: sub,
              taxAmount: tax,
              lineTotal,
            },
          });
        }
      }

      const refreshed = await tx.invoice.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!refreshed) throw new Error("Invoice not found");
      const totals = computeTotals(refreshed.lines);
      subtotal = totals.subtotal;
      taxAmount = totals.taxAmount;

      const tdsRate =
        data.tdsRate !== undefined
          ? data.tdsRate
          : (invoice.tdsRate ?? null);
      const tdsAmount = computeTdsAmount(subtotal, tdsRate);
      const totalAmount = Math.round((totals.totalAmount + tdsAmount) * 100) / 100;

      const update = await tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber: data.invoiceNumber?.trim() ?? invoice.invoiceNumber,
          invoiceDate: data.invoiceDate
            ? new Date(`${data.invoiceDate}T00:00:00`)
            : invoice.invoiceDate,
          dueDate:
            data.dueDate !== undefined
              ? data.dueDate
                ? new Date(`${data.dueDate}T00:00:00`)
                : null
              : invoice.dueDate,
          tdsSection:
            data.tdsSection !== undefined
              ? (data.tdsSection?.trim() || null)
              : invoice.tdsSection,
          tdsRate,
          tdsAmount,
          notes: data.notes !== undefined ? (data.notes?.trim() || null) : invoice.notes,
          subtotal,
          taxAmount,
          totalAmount,
          status:
            invoice.status === INV_MATCHED ? INV_RECEIVED : invoice.status,
          matchedAt: null,
        },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "INVOICE",
        entityId: id,
        action: "UPDATE",
        before,
        after: {
          invoiceNumber: update.invoiceNumber,
          totalAmount: update.totalAmount,
          tdsRate,
          status: update.status,
        },
        ip: clientIp(request),
      });

      return update;
    });

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  INV_APPROVED,
  INV_BOOKED,
  INV_PAID,
} from "@/lib/invoices";
import { appliedAdvanceTotal } from "@/lib/advances";
import { notifyUser } from "@/lib/workflow";

const RecordPaymentSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required"),
  paidAt: z.string().min(1, "Payment date is required"),
  reference: z.string().trim().min(1, "Payment reference is required"),
  amount: z.coerce.number().positive("Amount must be positive").optional(),
  notes: z.string().optional().nullable(),
});

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.PAYMENTS_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const invoices = await db.invoice.findMany({
    where: {
      orgId: user.orgId,
      status: { in: [INV_APPROVED, INV_BOOKED, INV_PAID] },
    },
    include: {
      vendor: { select: { legalName: true, code: true } },
      advanceApplications: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    invoices: invoices.map((inv) => ({
      ...inv,
      advanceApplied: appliedAdvanceTotal(inv.advanceApplications),
    })),
  });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.PAYMENTS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = RecordPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const invoice = await db.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id: data.invoiceId, orgId: user.orgId },
        include: {
          vendor: { select: { code: true, legalName: true } },
          purchaseOrder: {
            include: { requisition: { select: { requesterId: true } } },
          },
          advanceApplications: { select: { amount: true } },
        },
      });
      if (!existing) throw new Error("Invoice not found");
      if (![INV_APPROVED, INV_BOOKED].includes(existing.status)) {
        throw new Error("Only approved or booked invoices can be paid");
      }

      const advanceApplied = appliedAdvanceTotal(existing.advanceApplications);
      const due = Math.round((existing.totalAmount - advanceApplied) * 100) / 100;
      const amount = data.amount ?? due;
      if (amount > due + 0.01) {
        throw new Error(
          `Payment of ${amount} exceeds the outstanding balance of ${due}`,
        );
      }
      if (due <= 0) {
        throw new Error("Invoice is already fully covered by advances");
      }

      const paidAt = new Date(`${data.paidAt}T00:00:00`);
      const updated = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          status: INV_PAID,
          paidAt,
          paymentRef: data.reference,
          notes: data.notes?.trim() || existing.notes,
        },
        include: { vendor: { select: { legalName: true, code: true } } },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "INVOICE",
        entityId: existing.id,
        action: "PAY",
        before: { status: existing.status, due },
        after: { status: INV_PAID, amount, reference: data.reference },
        ip: clientIp(request),
      });

      const requesterId = existing.purchaseOrder?.requisition?.requesterId;
      if (requesterId) {
        await notifyUser(tx, {
          orgId: user.orgId,
          userId: requesterId,
          type: "PAYMENT_RECORDED",
          title: "Payment recorded",
          message: `${existing.invoiceNumber} was paid ₹${amount.toLocaleString("en-IN")} (${data.reference}).`,
          docType: "INV",
          docId: existing.id,
        });
      }

      return updated;
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

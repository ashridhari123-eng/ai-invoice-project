import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { ADV_REVERSED, advanceRemaining, advanceStatusFor } from "@/lib/advances";

const ApplySchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.ADVANCES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const { invoiceId, amount } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const advance = await tx.advancePayment.findFirst({
        where: { id, orgId: user.orgId },
        include: { applications: true },
      });
      if (!advance) throw new Error("Advance not found");
      if (advance.status === ADV_REVERSED) {
        throw new Error("A reversed advance cannot be applied");
      }

      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, orgId: user.orgId },
      });
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.vendorId !== advance.vendorId) {
        throw new Error("Invoice does not belong to the same vendor as this advance");
      }

      const remaining = advanceRemaining(advance.amount, advance.applications);
      if (amount > remaining) {
        throw new Error(
          `Amount exceeds the unapplied balance of ${remaining.toFixed(2)}`,
        );
      }

      const alreadyAppliedToInvoice = await tx.advanceApplication.aggregate({
        where: { orgId: user.orgId, advanceId: id, invoiceId },
        _sum: { amount: true },
      });
      const appliedOnInvoice = alreadyAppliedToInvoice._sum.amount ?? 0;
      if (appliedOnInvoice + amount > invoice.totalAmount + 0.005) {
        throw new Error(
          `Total applied to this invoice (${(appliedOnInvoice + amount).toFixed(2)}) exceeds the invoice total of ${invoice.totalAmount.toFixed(2)}`,
        );
      }

      const application = await tx.advanceApplication.create({
        data: {
          orgId: user.orgId,
          advanceId: id,
          invoiceId,
          amount: Math.round(amount * 100) / 100,
          appliedById: user.id,
        },
      });

      const updated = await tx.advancePayment.update({
        where: { id },
        data: { status: advanceStatusFor(advance.amount, [...advance.applications, application]) },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "ADVANCE",
        entityId: id,
        action: "APPLY",
        before: { status: advance.status, remaining },
        after: {
          invoiceCode: invoice.code,
          appliedAmount: amount,
          status: updated.status,
        },
        ip: clientIp(request),
      });

      return { application, advance: updated, status: updated.status, remaining: advanceRemaining(advance.amount, [...advance.applications, application]) };
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

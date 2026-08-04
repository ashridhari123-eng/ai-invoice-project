import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { nextDocNumber, DOC_ENTITY_ADVANCE } from "@/lib/numbers";
import { ADV_RECORDED } from "@/lib/advances";

const CreateAdvanceSchema = z.object({
  vendorId: z.string().min(1, "Vendor is required"),
  poId: z.string().optional().nullable(),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  currency: z.string().trim().default("INR"),
  advanceDate: z.string().min(1, "Advance date is required"),
  reference: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.ADVANCES_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const advances = await db.advancePayment.findMany({
    where: { orgId: user.orgId },
    include: {
      vendor: { select: { code: true, legalName: true } },
      purchaseOrder: { select: { code: true } },
      createdBy: { select: { name: true } },
      applications: {
        include: {
          invoice: { select: { code: true, invoiceNumber: true } },
        },
        orderBy: { appliedAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ advances });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.ADVANCES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = CreateAdvanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const advance = await db.$transaction(async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: data.vendorId, orgId: user.orgId },
      });
      if (!vendor) throw new Error("Vendor not found");

      if (data.poId) {
        const po = await tx.purchaseOrder.findFirst({
          where: { id: data.poId, orgId: user.orgId, vendorId: vendor.id },
        });
        if (!po) throw new Error("Purchase order not found for this vendor");
      }

      const code = await nextDocNumber(tx, user.orgId, DOC_ENTITY_ADVANCE);
      const created = await tx.advancePayment.create({
        data: {
          orgId: user.orgId,
          code,
          vendorId: vendor.id,
          poId: data.poId ?? null,
          amount: Math.round(data.amount * 100) / 100,
          currency: data.currency,
          advanceDate: new Date(`${data.advanceDate}T00:00:00`),
          reference: data.reference?.trim() || null,
          notes: data.notes?.trim() || null,
          status: ADV_RECORDED,
          createdById: user.id,
        },
        include: {
          vendor: { select: { code: true, legalName: true } },
          purchaseOrder: { select: { code: true } },
          applications: true,
        },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "ADVANCE",
        entityId: created.id,
        action: "CREATE",
        after: {
          code,
          vendorCode: vendor.code,
          poCode: created.purchaseOrder?.code ?? null,
          amount: created.amount,
          reference: created.reference ?? null,
        },
        ip: clientIp(request),
      });

      return created;
    });

    return NextResponse.json({ advance }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

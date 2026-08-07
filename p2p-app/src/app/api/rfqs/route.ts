import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { nextDocNumber, DOC_ENTITY_RFQ } from "@/lib/numbers";
import { PR_APPROVED } from "@/lib/requisitions";
import { RFQ_OPEN } from "@/lib/rfq";

const CreateRfqSchema = z.object({
  requisitionId: z.string().min(1, "Requisition is required"),
  vendorIds: z.array(z.string().min(1)).min(1, "At least one vendor is required"),
  needByDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.RFQ_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const rfqs = await db.rfq.findMany({
    where: { orgId: user.orgId },
    include: {
      requisition: { select: { code: true } },
      quotes: {
        select: { id: true, status: true, vendorId: true, totalAmount: true },
      },
      awards: {
        select: { vendorId: true, awardedAt: true },
        orderBy: { awardedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    rfqs: rfqs.map((r) => ({
      id: r.id,
      code: r.code,
      department: r.department,
      status: r.status,
      needByDate: r.needByDate,
      createdAt: r.createdAt,
      requisitionCode: r.requisition.code,
      vendorCount: r.quotes.length,
      submittedCount: r.quotes.filter((q) => q.status === "SUBMITTED").length,
      award: r.awards[0] ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.RFQ_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = CreateRfqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const rfq = await db.$transaction(async (tx) => {
      const requisition = await tx.purchaseRequisition.findFirst({
        where: { id: data.requisitionId, orgId: user.orgId },
        include: {
          lines: { orderBy: { lineNo: "asc" } },
          budget: { select: { category: true } },
        },
      });
      if (!requisition) throw new Error("Requisition not found");
      if (requisition.status !== PR_APPROVED) {
        throw new Error("Only approved requisitions can be sent for quotes");
      }

      const existing = await tx.rfq.findFirst({
        where: { orgId: user.orgId, requisitionId: requisition.id },
      });
      if (existing) {
        throw new Error(`An RFQ already exists for ${requisition.code}`);
      }

      const existingPo = await tx.purchaseOrder.findFirst({
        where: { orgId: user.orgId, requisitionId: requisition.id },
      });
      if (existingPo) {
        throw new Error(`${requisition.code} has already been converted to a purchase order`);
      }

      const vendors = await tx.vendor.findMany({
        where: { id: { in: data.vendorIds }, orgId: user.orgId, status: "ACTIVE" },
        select: { id: true },
      });
      if (vendors.length !== data.vendorIds.length) {
        throw new Error("One or more vendors are not active");
      }

      const code = await nextDocNumber(tx, user.orgId, DOC_ENTITY_RFQ);
      const created = await tx.rfq.create({
        data: {
          orgId: user.orgId,
          code,
          requisitionId: requisition.id,
          department: requisition.department,
          category: requisition.budget?.category ?? null,
          needByDate: data.needByDate ? new Date(`${data.needByDate}T00:00:00`) : null,
          status: RFQ_OPEN,
          notes: data.notes?.trim() || null,
          createdById: user.id,
          lines: {
            create: requisition.lines.map((l, index) => ({
              lineNo: index + 1,
              requisitionLineId: l.id,
              itemId: l.itemId,
              itemCode: l.itemCode,
              name: l.name,
              hsnSac: l.hsnSac,
              qty: l.qty,
              unit: l.unit,
              unitPrice: l.unitPrice,
            })),
          },
          quotes: {
            create: data.vendorIds.map((vendorId) => ({
              vendorId,
              createdById: user.id,
              status: "INVITED",
            })),
          },
        },
        include: { lines: true, quotes: true, requisition: true },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "RFQ",
        entityId: created.id,
        action: "CREATE",
        after: { code, requisitionCode: requisition.code, vendors: data.vendorIds },
        ip: clientIp(request),
      });

      return created;
    });

    return NextResponse.json({ rfq }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

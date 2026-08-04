import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { nextDocNumber, DOC_ENTITY_PR } from "@/lib/numbers";
import {
  resolveLines,
  totalForLines,
  PR_DRAFT,
} from "@/lib/requisitions";

const LineSchema = z.object({
  itemId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  taxRatePct: z.coerce.number().min(0).max(28).default(0),
});

const RequisitionSchema = z.object({
  department: z.string().min(1, "Department is required"),
  expectedDeliveryDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
  notes: z.string().optional().nullable(),
  budgetId: z.string().optional().nullable(),
  lines: z.array(LineSchema).min(1, "At least one line is required"),
});

export async function GET(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.REQUISITIONS_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const url = new URL(request.url);
  const mine = url.searchParams.get("mine") === "true";

  const requisitions = await db.purchaseRequisition.findMany({
    where: { orgId: user.orgId, ...(mine ? { requesterId: user.id } : {}) },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      budget: { select: { id: true, department: true, category: true, period: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const instances = await db.approvalInstance.findMany({
    where: {
      orgId: user.orgId,
      docType: "PR",
      docId: { in: requisitions.map((r) => r.id) },
    },
    select: { docId: true, status: true, currentStep: true, amount: true },
  });
  const byDocId = new Map<string, { status: string; currentStep: number; amount: number }>();
  for (const i of instances) {
    byDocId.set(i.docId, { status: i.status, currentStep: i.currentStep, amount: i.amount });
  }

  return NextResponse.json({
    requisitions: requisitions.map((r) => ({
      ...r,
      approvalInstance: byDocId.get(r.id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.REQUISITIONS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = RequisitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const requisition = await db.$transaction(async (tx) => {
      const lines = await resolveLines(tx, user.orgId, data.lines);
      const totalAmount = totalForLines(lines);

      if (data.budgetId) {
        const budget = await tx.budget.findUnique({
          where: { id: data.budgetId, orgId: user.orgId },
        });
        if (!budget) throw new Error("Selected budget not found");
      }

      const code = await nextDocNumber(tx, user.orgId, DOC_ENTITY_PR);
      const created = await tx.purchaseRequisition.create({
        data: {
          orgId: user.orgId,
          code,
          requesterId: user.id,
          department: data.department,
          budgetId: data.budgetId ?? null,
          status: PR_DRAFT,
          expectedDeliveryDate: data.expectedDeliveryDate,
          notes: data.notes?.trim() || null,
          totalAmount,
          createdById: user.id,
          lines: {
            create: lines.map((l, index) => ({
              lineNo: index + 1,
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
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "PR",
        entityId: created.id,
        action: "CREATE",
        after: { code, totalAmount, department: data.department },
        ip: clientIp(request),
      });

      return created;
    });

    return NextResponse.json({ requisition }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

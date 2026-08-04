import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import {
  PR_DRAFT,
  PR_RETURNED,
  PR_SUBMITTED,
  budgetAvailability,
} from "@/lib/requisitions";
import { findMatchingRule, startApprovalInstance } from "@/lib/workflow";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.REQUISITIONS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const requisition = await db.purchaseRequisition.findFirst({
    where: { id, orgId: user.orgId },
    include: { lines: true },
  });
  if (!requisition) {
    return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
  }
  if (![PR_DRAFT, PR_RETURNED].includes(requisition.status)) {
    return NextResponse.json(
      { error: "Only drafts and returned requisitions can be submitted" },
      { status: 400 },
    );
  }
  const isOwner = requisition.requesterId === user.id;
  const isAdmin = user.role.code === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (requisition.lines.length === 0) {
    return NextResponse.json(
      { error: "Add at least one line before submitting" },
      { status: 400 },
    );
  }

  let available: number | null = null;
  if (requisition.budgetId) {
    try {
      const a = await budgetAvailability(db, user.orgId, requisition.budgetId);
      available = a.available;
      if (a.available < requisition.totalAmount) {
        return NextResponse.json(
          { error: `Insufficient budget. Available: ₹${Math.round(a.available).toLocaleString("en-IN")}` },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json({ error: "Selected budget not found" }, { status: 400 });
    }
  }

  const result = await db.$transaction(async (tx) => {
    const rule = await findMatchingRule(tx, user.orgId, "PR", requisition.totalAmount);
    const updated = await tx.purchaseRequisition.update({
      where: { id },
      data: {
        status: PR_SUBMITTED,
        submittedAt: new Date(),
        expectedDeliveryDate: requisition.expectedDeliveryDate,
      },
    });

    const instance = await startApprovalInstance(tx, {
      orgId: user.orgId,
      docType: "PR",
      docId: id,
      ruleId: rule?.id ?? null,
      submittedById: user.id,
      amount: requisition.totalAmount,
      department: requisition.department,
      ip: clientIp(request),
    });

    return { requisition: updated, instance, rule };
  });

  return NextResponse.json({
    requisition: result.requisition,
    instance: result.instance,
    rule: result.rule,
    budgetAvailable: available,
  });
}

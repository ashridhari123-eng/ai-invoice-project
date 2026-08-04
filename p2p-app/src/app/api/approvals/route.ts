import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { APPROVAL_PENDING, stepsForRule } from "@/lib/workflow";

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.APPROVALS_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const instances = await db.approvalInstance.findMany({
    where: {
      orgId: user.orgId,
      status: APPROVAL_PENDING,
      docType: { in: ["PR", "INV"] },
    },
    include: {
      rule: true,
      actions: {
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const mine = instances.filter((i) => {
    const steps = stepsForRule(i.rule);
    const step = steps[i.currentStep - 1];
    return step ? step.role === user.role.code : false;
  });

  const prIds = mine.filter((i) => i.docType === "PR").map((i) => i.docId);
  const invIds = mine.filter((i) => i.docType === "INV").map((i) => i.docId);

  const [requisitions, invoices] = await Promise.all([
    db.purchaseRequisition.findMany({
      where: { orgId: user.orgId, id: { in: prIds } },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        budget: { select: { id: true, department: true, category: true } },
      },
    }),
    db.invoice.findMany({
      where: { orgId: user.orgId, id: { in: invIds } },
      include: {
        vendor: { select: { id: true, legalName: true } },
        purchaseOrder: { select: { id: true, code: true } },
      },
    }),
  ]);
  const reqById = new Map(requisitions.map((r) => [r.id, r]));
  const invById = new Map(invoices.map((i) => [i.id, i]));

  const approvals = mine.map((i) => ({
    instance: i,
    requisition: i.docType === "PR" ? (reqById.get(i.docId) ?? null) : null,
    invoice: i.docType === "INV" ? (invById.get(i.docId) ?? null) : null,
  }));

  return NextResponse.json({ approvals });
}

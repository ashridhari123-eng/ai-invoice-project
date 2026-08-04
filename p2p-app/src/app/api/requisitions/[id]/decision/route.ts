import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  PR_SUBMITTED,
  PR_APPROVED,
  PR_REJECTED,
  PR_RETURNED,
} from "@/lib/requisitions";
import {
  applyApprovalDecision,
  APPROVAL_PENDING,
} from "@/lib/workflow";

const DecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "SEND_BACK"]),
  comment: z.string().optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.APPROVALS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const requisition = await db.purchaseRequisition.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!requisition) {
    return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
  }
  if (requisition.status !== PR_SUBMITTED) {
    return NextResponse.json(
      { error: "Only submitted requisitions can be decided" },
      { status: 400 },
    );
  }

  const instances = await db.approvalInstance.findMany({
    where: { orgId: user.orgId, docType: "PR", docId: id },
  });
  const instance = instances.find(
    (i) => i.status === APPROVAL_PENDING,
  );
  if (!instance) {
    return NextResponse.json(
      { error: "No pending approval for this requisition" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const outcome = await applyApprovalDecision({
        tx,
        instanceId: instance.id,
        actorId: user.id,
        decision: parsed.data.decision,
        comment: parsed.data.comment,
        ip: clientIp(request),
      });

      if (outcome.decided) {
        const decision = parsed.data.decision;
        const status =
          decision === "APPROVE"
            ? PR_APPROVED
            : decision === "SEND_BACK"
              ? PR_RETURNED
              : PR_REJECTED;
        await tx.purchaseRequisition.update({
          where: { id },
          data: { status, decidedAt: new Date() },
        });

        if (outcome.approved && requisition.budgetId) {
          const existing = await tx.budgetCommitment.findFirst({
            where: { requisitionId: id, status: "ACTIVE" },
          });
          if (!existing) {
            await tx.budgetCommitment.create({
              data: {
                orgId: user.orgId,
                budgetId: requisition.budgetId,
                requisitionId: id,
                amount: requisition.totalAmount,
                status: "ACTIVE",
              },
            });
          }
        }

        await logAudit(tx, {
          orgId: user.orgId,
          actorId: user.id,
          actorEmail: user.email,
          entity: "PR",
          entityId: id,
          action: decision === "APPROVE" ? "APPROVE" : "DECISION",
          before: { status: PR_SUBMITTED },
          after: { status, finalStep: true, decision },
          ip: clientIp(request),
        });
      }

      return { outcome };
    });

    return NextResponse.json({ outcome: result.outcome });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}

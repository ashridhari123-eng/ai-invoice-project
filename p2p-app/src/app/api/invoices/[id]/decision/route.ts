import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  INV_SUBMITTED,
  INV_APPROVED,
  INV_REJECTED,
  SYNC_NONE,
  SYNC_PENDING,
} from "@/lib/invoices";
import {
  applyApprovalDecision,
  APPROVAL_PENDING,
} from "@/lib/workflow";
import { isZohoConfigured } from "@/lib/zoho-sync";

const DecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.APPROVALS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const invoice = await db.invoice.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status !== INV_SUBMITTED) {
    return NextResponse.json(
      { error: "Only submitted invoices can be decided" },
      { status: 400 },
    );
  }

  const instances = await db.approvalInstance.findMany({
    where: { orgId: user.orgId, docType: "INV", docId: id },
  });
  const instance = instances.find((i) => i.status === APPROVAL_PENDING);
  if (!instance) {
    return NextResponse.json(
      { error: "No pending approval for this invoice" },
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
        entity: "INVOICE",
      });

      if (outcome.decided) {
        const status = outcome.approved ? INV_APPROVED : INV_REJECTED;
        const zohoReady = await isZohoConfigured(user.orgId);
        await tx.invoice.update({
          where: { id },
          data: {
            status,
            decidedAt: new Date(),
            syncStatus: zohoReady ? SYNC_PENDING : SYNC_NONE,
          },
        });

        await logAudit(tx, {
          orgId: user.orgId,
          actorId: user.id,
          actorEmail: user.email,
          entity: "INVOICE",
          entityId: id,
          action: outcome.approved ? "APPROVE" : "REJECT",
          before: { status: INV_SUBMITTED },
          after: { status, finalStep: true },
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

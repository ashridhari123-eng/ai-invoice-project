import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  PR_DRAFT,
  PR_SUBMITTED,
  PR_APPROVED,
  PR_CANCELLED,
} from "@/lib/requisitions";
import {
  APPROVAL_PENDING,
  APPROVAL_CANCELLED,
} from "@/lib/workflow";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.REQUISITIONS_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const requisition = await db.purchaseRequisition.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      budget: true,
      lines: { orderBy: { lineNo: "asc" } },
    },
  });

  if (!requisition) {
    return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
  }

  const approvalInstances = await db.approvalInstance.findMany({
    where: { orgId: user.orgId, docType: "PR", docId: id },
    include: {
      rule: true,
      actions: {
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ requisition, approvalInstances });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.REQUISITIONS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const requisition = await db.purchaseRequisition.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!requisition) {
    return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
  }

  const instances = await db.approvalInstance.findMany({
    where: { orgId: user.orgId, docType: "PR", docId: id },
  });

  const isOwner = requisition.requesterId === user.id;
  const isAdmin = user.role.code === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (requisition.status === PR_APPROVED) {
    return NextResponse.json(
      { error: "An approved requisition cannot be cancelled. Raise a new request instead." },
      { status: 400 },
    );
  }
  if (requisition.status === PR_CANCELLED) {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  const result = await db.$transaction(async (tx) => {
    if (requisition.status === PR_DRAFT) {
      await tx.purchaseRequisition.delete({ where: { id } });
      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "PR",
        entityId: id,
        action: "DELETE",
        before: { code: requisition.code, status: requisition.status },
        ip: clientIp(request),
      });
      return { deleted: true };
    }

    await tx.purchaseRequisition.update({
      where: { id },
      data: { status: PR_CANCELLED },
    });

    const pending = instances.find(
      (i) => i.status === APPROVAL_PENDING,
    );
    if (pending) {
      await tx.approvalInstance.update({
        where: { id: pending.id },
        data: { status: APPROVAL_CANCELLED, decidedAt: new Date() },
      });
    }

    await tx.budgetCommitment.updateMany({
      where: { requisitionId: id, status: "ACTIVE" },
      data: { status: "RELEASED", releasedAt: new Date() },
    });

    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "PR",
      entityId: id,
      action: "STATUS_CHANGE",
      before: { status: requisition.status },
      after: { status: PR_CANCELLED },
      ip: clientIp(request),
    });

    return { deleted: false };
  });

  return NextResponse.json(result);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.REQUISITIONS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const requisition = await db.purchaseRequisition.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!requisition) {
    return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
  }
  if (requisition.status !== PR_SUBMITTED) {
    return NextResponse.json(
      { error: "Only submitted requisitions can be withdrawn" },
      { status: 400 },
    );
  }
  const isOwner = requisition.requesterId === user.id;
  const isAdmin = user.role.code === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.$transaction(async (tx) => {
    await tx.purchaseRequisition.update({
      where: { id },
      data: { status: PR_DRAFT, submittedAt: null },
    });
    await tx.approvalInstance.updateMany({
      where: { docType: "PR", docId: id, status: APPROVAL_PENDING },
      data: { status: APPROVAL_CANCELLED, decidedAt: new Date() },
    });
    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "PR",
      entityId: id,
      action: "STATUS_CHANGE",
      before: { status: PR_SUBMITTED },
      after: { status: PR_DRAFT },
      ip: clientIp(request),
    });
  });

  return NextResponse.json({ ok: true });
}

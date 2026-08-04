import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  PO_DRAFT,
  PO_SENT,
  NOTIFY_PO_SENT,
} from "@/lib/purchase-orders";
import { notifyUser } from "@/lib/workflow";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.PO_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      vendor: { select: { legalName: true, email: true } },
      requisition: { select: { requesterId: true, code: true } },
    },
  });
  if (!purchaseOrder) {
    return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  }
  if (purchaseOrder.status !== PO_DRAFT) {
    return NextResponse.json(
      { error: `A ${purchaseOrder.status.replace("_", " ")} purchase order cannot be sent` },
      { status: 400 },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const sentAt = new Date();
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: PO_SENT,
        sentAt,
        sentTo: purchaseOrder.vendor.email ?? null,
      },
    });

    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "PO",
      entityId: id,
      action: "SEND",
      before: { status: PO_DRAFT },
      after: { status: PO_SENT, sentTo: updated.sentTo, sentAt },
      ip: clientIp(request),
    });

    await notifyUser(tx, {
      orgId: user.orgId,
      userId: purchaseOrder.requisition.requesterId,
      type: NOTIFY_PO_SENT,
      title: "Purchase order sent",
      message: `${purchaseOrder.code} was sent to ${purchaseOrder.vendor.legalName}.`,
      docType: "PO",
      docId: id,
    });

    return updated;
  });

  return NextResponse.json({ purchaseOrder: result });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { nextDocNumber, DOC_ENTITY_GRN } from "@/lib/numbers";
import { notifyUser } from "@/lib/workflow";
import {
  PO_SENT,
  PO_PARTIALLY_RECEIVED,
  PO_RECEIVED,
  NOTIFY_GRN_CREATED,
} from "@/lib/purchase-orders";

const ReceiptLineSchema = z.object({
  poLineId: z.string(),
  qtyReceived: z.number().positive(),
});

const CreateSchema = z.object({
  poId: z.string(),
  receivedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(ReceiptLineSchema).min(1),
});

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.RECEIPTS_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const receipts = await db.goodsReceipt.findMany({
    where: { orgId: user.orgId },
    include: {
      purchaseOrder: {
        select: { id: true, code: true, status: true },
      },
      lines: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ receipts });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.RECEIPTS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { poId, receivedAt, notes, lines } = parsed.data;

  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id: poId, orgId: user.orgId },
    include: {
      lines: true,
      requisition: { select: { requesterId: true, code: true } },
      vendor: { select: { legalName: true } },
    },
  });
  if (!purchaseOrder) {
    return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  }
  if (![PO_SENT, PO_PARTIALLY_RECEIVED].includes(purchaseOrder.status)) {
    return NextResponse.json(
      { error: `A ${purchaseOrder.status.replace("_", " ")} purchase order cannot receive goods` },
      { status: 400 },
    );
  }

  const poLineByKey = new Map(purchaseOrder.lines.map((l) => [l.id, l]));

  const existingReceipts = await db.goodsReceiptLine.groupBy({
    by: ["poLineId"],
    where: {
      receipt: { orgId: user.orgId, poId },
    },
    _sum: { qtyReceived: true },
  });
  const receivedByPoLine = new Map(
    existingReceipts.map((r) => [r.poLineId, r._sum.qtyReceived ?? 0]),
  );

  const validated: Array<{
    poLine: (typeof purchaseOrder.lines)[number];
    qtyReceived: number;
    already: number;
  }> = [];
  for (const line of lines) {
    const poLine = poLineByKey.get(line.poLineId);
    if (!poLine) {
      return NextResponse.json({ error: "Line does not belong to this purchase order" }, { status: 400 });
    }
    const already = receivedByPoLine.get(line.poLineId) ?? 0;
    if (already + line.qtyReceived > poLine.qty) {
      return NextResponse.json(
        {
          error: `Receipt for ${poLine.itemCode} exceeds PO quantity (already received ${already} of ${poLine.qty})`,
        },
        { status: 400 },
      );
    }
    validated.push({ poLine, qtyReceived: line.qtyReceived, already });
  }

  const result = await db.$transaction(async (tx) => {
    const code = await nextDocNumber(tx, user.orgId, DOC_ENTITY_GRN);
    const receipt = await tx.goodsReceipt.create({
      data: {
        orgId: user.orgId,
        code,
        poId,
        status: "RECEIVED",
        receivedBy: user.name,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        notes: notes ?? null,
        lines: {
          create: validated.map((v) => ({
            poLineId: v.poLine.id,
            itemCode: v.poLine.itemCode,
            name: v.poLine.name,
            qtyReceived: v.qtyReceived,
          })),
        },
      },
      include: { lines: true },
    });

    const newReceived = new Map(receivedByPoLine);
    for (const v of validated) {
      newReceived.set(v.poLine.id, v.already + v.qtyReceived);
    }
    const fullyReceived = purchaseOrder.lines.every(
      (l) => (newReceived.get(l.id) ?? 0) >= l.qty,
    );
    const status = fullyReceived ? PO_RECEIVED : PO_PARTIALLY_RECEIVED;

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status },
    });

    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "GRN",
      entityId: receipt.id,
      action: "RECEIVE",
      after: {
        code,
        poId,
        poCode: purchaseOrder.code,
        status,
        lines: validated.map((v) => ({ item: v.poLine.itemCode, qty: v.qtyReceived })),
      },
      ip: clientIp(request),
    });

    if (purchaseOrder.requisition.requesterId) {
      await notifyUser(tx, {
        orgId: user.orgId,
        userId: purchaseOrder.requisition.requesterId,
        type: NOTIFY_GRN_CREATED,
        title: "Goods received",
        message: `Goods against ${purchaseOrder.code} from ${purchaseOrder.vendor.legalName} were received (${receipt.code}).`,
        docType: "GRN",
        docId: receipt.id,
      });
    }

    return { receipt, status };
  });

  return NextResponse.json({
    receipt: result.receipt,
    purchaseOrderStatus: result.status,
  });
}

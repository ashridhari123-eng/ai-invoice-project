import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  INV_RECEIVED,
  INV_MATCHED,
  SYNC_NONE,
  matchLine,
  isFullyMatched,
} from "@/lib/invoices";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.INVOICES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const invoice = await db.invoice.findFirst({
    where: { id, orgId: user.orgId },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (![INV_RECEIVED, INV_MATCHED].includes(invoice.status)) {
    return NextResponse.json(
      { error: `A ${invoice.status.replace("_", " ")} invoice cannot be matched` },
      { status: 400 },
    );
  }

  const purchaseOrder = invoice.poId
    ? await db.purchaseOrder.findFirst({
        where: { id: invoice.poId, orgId: user.orgId },
        include: {
          lines: true,
          receipts: { include: { lines: true } },
        },
      })
    : null;
  if (!purchaseOrder) {
    return NextResponse.json(
      { error: "Source purchase order not found" },
      { status: 400 },
    );
  }

  const receivedByItem = new Map<string, number>();
  for (const receipt of purchaseOrder.receipts) {
    for (const line of receipt.lines) {
      receivedByItem.set(
        line.itemCode,
        (receivedByItem.get(line.itemCode) ?? 0) + line.qtyReceived,
      );
    }
  }

  const poLineByItem = new Map(
    purchaseOrder.lines.map((l) => [l.itemCode, l]),
  );

  const results = invoice.lines.map((line) => {
    const poLine = poLineByItem.get(line.itemCode) ?? null;
    const receivedQty = receivedByItem.get(line.itemCode) ?? 0;
    const match = matchLine(line, poLine ?? null, receivedQty);
    return { lineId: line.id, matchStatus: match.matchStatus, matchNotes: match.matchNotes };
  });

  const result = await db.$transaction(async (tx) => {
    for (const r of results) {
      await tx.invoiceLine.update({
        where: { id: r.lineId },
        data: { matchStatus: r.matchStatus, matchNotes: r.matchNotes },
      });
    }

    const refreshed = await tx.invoice.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!refreshed) throw new Error("Invoice not found");
    const fullyMatched = isFullyMatched(refreshed.lines);
    const status = fullyMatched ? INV_MATCHED : INV_RECEIVED;

    const updated = await tx.invoice.update({
      where: { id },
      data: { status, matchedAt: new Date(), syncStatus: SYNC_NONE },
    });

    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "INVOICE",
      entityId: id,
      action: "MATCH",
      before: { status: invoice.status },
      after: {
        status,
        fullyMatched,
        lineResults: results.map((r) => r.matchStatus),
      },
      ip: clientIp(request),
    });

    return { updated, fullyMatched };
  });

  return NextResponse.json({
    invoice: result.updated,
    fullyMatched: result.fullyMatched,
    lines: results,
  });
}

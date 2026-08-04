import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  INV_APPROVED,
  INV_BOOKED,
  SYNC_FAILED,
} from "@/lib/invoices";
import { pushInvoiceToZoho, markSyncFailed } from "@/lib/zoho-sync";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const invoice = await db.invoice.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (
    ![INV_APPROVED, INV_BOOKED].includes(invoice.status) &&
    invoice.syncStatus !== SYNC_FAILED
  ) {
    return NextResponse.json(
      { error: "Only approved invoices can be booked in Zoho Books" },
      { status: 400 },
    );
  }

  try {
    const result = await pushInvoiceToZoho(user.orgId, id);
    await logAudit(db as never, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "INVOICE",
      entityId: id,
      action: "BOOK",
      after: { billId: result.billId, billNumber: result.billNumber },
      ip: clientIp(request),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoho sync failed";
    await markSyncFailed(user.orgId, id, message);
    await logAudit(db as never, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "INVOICE",
      entityId: id,
      action: "PUSH",
      after: { error: message },
      ip: clientIp(request),
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

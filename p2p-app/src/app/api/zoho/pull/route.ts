import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { pullPaidBillsToZoho } from "@/lib/zoho-sync";

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  try {
    const result = await pullPaidBillsToZoho(user.orgId);
    await logAudit(db as never, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "ZOHO",
      entityId: user.orgId,
      action: "PULL",
      after: { paymentsChecked: result.paymentsChecked, billsUpdated: result.billsUpdated },
      ip: clientIp(request),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoho payment pull failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { runZohoReconciliation } from "@/lib/zoho-reconcile";

export async function POST() {
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  try {
    const result = await runZohoReconciliation(user.orgId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Zoho reconciliation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

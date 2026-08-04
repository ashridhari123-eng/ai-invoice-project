import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import {
  buildConsentUrl,
  buildRedirectUri,
  zohoClientConfig,
} from "@/lib/zoho";

export async function POST() {
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  try {
    const url = buildConsentUrl(zohoClientConfig(), buildRedirectUri());
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoho is not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

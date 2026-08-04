import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import {
  buildRedirectUri,
  exchangeCode,
  fetchDefaultOrganization,
  zohoClientConfig,
  encryptSecret,
  ZOHO_SCOPES,
} from "@/lib/zoho";

function redirectBack(request: Request, params: string) {
  const base = new URL("/invoices/reconciliation", request.url);
  return NextResponse.redirect(`${base.pathname}?${params}`);
}

export async function GET(request: Request) {
  const { error: authError, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (authError || !user) return authError ?? NextResponse.json({}, { status: 401 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  if (oauthError || !code) {
    return redirectBack(
      request,
      `zoho=error&reason=${encodeURIComponent(oauthError ?? "missing authorization code")}`,
    );
  }

  const redirectUri = buildRedirectUri();
  const config = zohoClientConfig();

  try {
    const tokens = await exchangeCode(config, code, redirectUri);
    const org = await fetchDefaultOrganization(tokens.accessToken, config.region);
    const now = new Date();
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    await db.zohoConfig.upsert({
      where: { orgId: user.orgId },
      create: {
        orgId: user.orgId,
        region: config.region,
        clientId: config.clientId,
        clientSecretEnc: config.clientSecretEnc,
        refreshTokenEnc: encryptSecret(tokens.refreshToken),
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: expiresAt,
        organizationId: org.organizationId,
        scopes: ZOHO_SCOPES,
        isActive: true,
        connectedBy: user.id,
        connectedAt: now,
        lastSyncAt: now,
      },
      update: {
        region: config.region,
        clientId: config.clientId,
        clientSecretEnc: config.clientSecretEnc,
        refreshTokenEnc: encryptSecret(tokens.refreshToken),
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: expiresAt,
        organizationId: org.organizationId,
        scopes: ZOHO_SCOPES,
        isActive: true,
        connectedBy: user.id,
        connectedAt: now,
        lastSyncAt: now,
      },
    });

    await logAudit(db as never, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "ZOHO",
      entityId: user.orgId,
      action: "CONNECT",
      after: { organizationId: org.organizationId, orgName: org.orgName },
      ip: clientIp(request),
    });

    return redirectBack(request, "zoho=connected");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoho connection failed";
    return redirectBack(
      request,
      `zoho=error&reason=${encodeURIComponent(message)}`,
    );
  }
}

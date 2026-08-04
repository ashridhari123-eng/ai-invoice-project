import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error;

  const config = await db.zohoConfig.findUnique({ where: { orgId: user.orgId } });
  return NextResponse.json({
    connected: Boolean(config?.isActive),
    organizationId: config?.organizationId ?? null,
    clientId: mask(config?.clientId),
    region: config?.region ?? null,
    connectedAt: config?.connectedAt ?? null,
    lastSyncAt: config?.lastSyncAt ?? null,
  });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const config = await db.zohoConfig.findUnique({ where: { orgId: user.orgId } });
  if (!config) {
    return NextResponse.json({ error: "Zoho Books is not connected" }, { status: 404 });
  }

  await db.zohoConfig.update({
    where: { id: config.id },
    data: {
      isActive: false,
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshTokenEnc: "",
    },
  });

  await logAudit(db as never, {
    orgId: user.orgId,
    actorId: user.id,
    actorEmail: user.email,
    entity: "ZOHO",
    entityId: user.orgId,
    action: "DISCONNECT",
    ip: clientIp(request),
  });

  return NextResponse.json({ connected: false });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { clientIp } from "@/lib/api";

export async function POST(request: Request) {
  const user = await getSession();
  if (user) {
    await db.auditLog.create({
      data: {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "USER",
        entityId: user.id,
        action: "LOGOUT",
        ip: clientIp(request),
      },
    });
  }

  const store = await cookies();
  store.delete(SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}

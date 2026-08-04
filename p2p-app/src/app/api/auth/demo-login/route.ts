import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEMO_EMAILS } from "@/lib/demo";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { clientIp } from "@/lib/api";

const DemoLoginSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = DemoLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (!DEMO_EMAILS.has(email)) {
    return NextResponse.json({ error: "Not a demo account" }, { status: 403 });
  }

  const user = await db.user.findFirst({
    where: { email },
    include: { role: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Demo account not found" }, { status: 404 });
  }

  if (!user.isActive) {
    return NextResponse.json({ error: "Account is disabled" }, { status: 403 });
  }

  const token = await createSessionToken(user.id);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "USER",
      entityId: user.id,
      action: "DEMO_LOGIN",
      ip: clientIp(request),
    });
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role.code },
  });
}

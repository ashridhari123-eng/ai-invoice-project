import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { can } from "@/lib/roles";

export const SESSION_COOKIE = "p2p_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const SESSION_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret-change-me",
);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(SESSION_SECRET);
}

async function readSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    const userId = payload.sub;
    if (!userId) return null;

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        organization: true,
      },
    });

    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

export const getSession = cache(readSessionUser);

export async function requireUser() {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(action: string) {
  const user = await requireUser();
  if (!can(user.role, action)) redirect("/dashboard");
  return user;
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>;

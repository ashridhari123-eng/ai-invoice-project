import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "@/lib/auth";
import { can } from "@/lib/roles";

export async function requireApiAuth(
  action?: string,
): Promise<{ error: NextResponse; user?: never } | { error?: never; user: SessionUser }> {
  const user = await getSession();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (action && !can(user.role, action)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

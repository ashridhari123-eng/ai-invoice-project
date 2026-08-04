import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let permissions: string[] = [];
  try {
    permissions = JSON.parse(user.role.permissions);
  } catch {
    permissions = [];
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.code,
      roleName: user.role.name,
      department: user.department,
      organization: user.organization.name,
    },
    permissions,
  });
}

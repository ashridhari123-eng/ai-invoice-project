import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";

export async function GET() {
  const { error } = await requireApiAuth(PERMISSIONS.AUDIT_READ);
  if (error) return error;

  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ entries });
}

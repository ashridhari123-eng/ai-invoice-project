import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";

export async function GET() {
  const { error, user } = await requireApiAuth();
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const [unreadCount, notifications] = await Promise.all([
    db.notification.count({
      where: { userId: user.id, readAt: null },
    }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({ unreadCount, notifications });
}

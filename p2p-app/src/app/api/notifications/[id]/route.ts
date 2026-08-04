import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth();
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const notification = await db.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!notification) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  const updated = await db.notification.update({
    where: { id },
    data: { readAt: notification.readAt ?? new Date() },
  });

  return NextResponse.json({ notification: updated });
}

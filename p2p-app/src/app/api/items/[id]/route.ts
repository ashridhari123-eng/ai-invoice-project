import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";

const ActiveSchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.ITEMS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = ActiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await db.item.findUnique({
    where: { id, orgId: user.orgId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const item = await db.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id },
      data: { isActive: parsed.data.isActive },
    });
    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "ITEM",
      entityId: id,
      action: "STATUS_CHANGE",
      before: { isActive: existing.isActive },
      after: { isActive: updated.isActive },
      ip: clientIp(request),
    });
    return updated;
  });

  return NextResponse.json({ item });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.ITEMS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const existing = await db.item.findUnique({
    where: { id, orgId: user.orgId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await db.$transaction(async (tx) => {
    await tx.item.delete({ where: { id } });
    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "ITEM",
      entityId: id,
      action: "DELETE",
      before: { code: existing.code, name: existing.name, hsnSac: existing.hsnSac },
      ip: clientIp(request),
    });
  });

  return NextResponse.json({ ok: true });
}

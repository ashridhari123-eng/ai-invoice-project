import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";

const StatusSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "BLOCKED"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.VENDORS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await db.vendor.findUnique({
    where: { id, orgId: user.orgId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  const vendor = await db.$transaction(async (tx) => {
    const updated = await tx.vendor.update({
      where: { id },
      data: { status: parsed.data.status },
    });
    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "VENDOR",
      entityId: id,
      action: "STATUS_CHANGE",
      before: { status: existing.status },
      after: { status: updated.status },
      ip: clientIp(request),
    });
    return updated;
  });

  return NextResponse.json({ vendor });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.VENDORS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const existing = await db.vendor.findUnique({
    where: { id, orgId: user.orgId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  await db.$transaction(async (tx) => {
    await tx.vendor.delete({ where: { id } });
    await logAudit(tx, {
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      entity: "VENDOR",
      entityId: id,
      action: "DELETE",
      before: { code: existing.code, legalName: existing.legalName, pan: existing.pan },
      ip: clientIp(request),
    });
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { CAP_REJECTED } from "@/lib/captures";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.CAPTURES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const reason =
    typeof body === "object" && body !== null && "reason" in body
      ? String((body as { reason?: unknown }).reason ?? "").slice(0, 500)
      : "";

  try {
    const result = await db.$transaction(async (tx) => {
      const capture = await tx.capturedDocument.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!capture) throw new Error("Captured document not found");
      if (capture.status === CAP_REJECTED) {
        throw new Error("This document is already rejected");
      }

      const updated = await tx.capturedDocument.update({
        where: { id },
        data: {
          status: CAP_REJECTED,
          error: reason || null,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "CAPTURE",
        entityId: id,
        action: "REJECT",
        before: { status: capture.status },
        after: { status: CAP_REJECTED, reason: reason || null },
        ip: clientIp(request),
      });

      return updated;
    });

    return NextResponse.json({ capture: result });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

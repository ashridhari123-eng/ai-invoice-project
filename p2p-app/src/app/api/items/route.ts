import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { nextDocNumber, DOC_ENTITY_ITEM } from "@/lib/numbers";

const ItemSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional().or(z.literal("")),
  hsnSac: z.string().regex(/^[0-9]{4}([0-9]{2})?$/, "Invalid HSN/SAC code"),
  unit: z.string().min(1).default("each"),
  defaultTaxRatePct: z.coerce.number().min(0).max(28).default(0),
});

export async function GET() {
  const { error } = await requireApiAuth(PERMISSIONS.ITEMS_READ);
  if (error) return error;

  const items = await db.item.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.ITEMS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = ItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const item = await db.$transaction(async (tx) => {
      const code = await nextDocNumber(tx, user.orgId, DOC_ENTITY_ITEM);
      const created = await tx.item.create({
        data: {
          orgId: user.orgId,
          code,
          name: data.name.trim(),
          description: data.description?.trim() || null,
          hsnSac: data.hsnSac.trim(),
          unit: data.unit.trim(),
          defaultTaxRatePct: data.defaultTaxRatePct,
          isActive: true,
          createdById: user.id,
        },
      });

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "ITEM",
        entityId: created.id,
        action: "CREATE",
        after: created,
        ip: clientIp(request),
      });

      return created;
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "An item with this name already exists" },
        { status: 409 },
      );
    }
    throw err;
  }
}

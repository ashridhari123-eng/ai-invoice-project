import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";

const ZOHO_MAPPING_KINDS = ["TAX_RATE", "ACCOUNT_CATEGORY"] as const;

const MappingSchema = z.object({
  kind: z.enum(ZOHO_MAPPING_KINDS),
  sourceKey: z.string().trim().min(1, "Source is required"),
  sourceLabel: z.string().trim().optional().or(z.literal("")),
  targetId: z.string().trim().min(1, "Target ID is required"),
  targetName: z.string().trim().optional().or(z.literal("")),
});

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error;

  const mappings = await db.zohoMapping.findMany({
    where: { orgId: user.orgId },
    orderBy: [{ kind: "asc" }, { sourceKey: "asc" }],
  });

  return NextResponse.json({ mappings });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = MappingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const mapping = await db.zohoMapping.upsert({
    where: {
      orgId_kind_sourceKey: {
        orgId: user.orgId,
        kind: data.kind,
        sourceKey: data.sourceKey,
      },
    },
    create: {
      orgId: user.orgId,
      kind: data.kind,
      sourceKey: data.sourceKey,
      sourceLabel: data.sourceLabel || null,
      targetId: data.targetId,
      targetName: data.targetName || null,
    },
    update: {
      sourceLabel: data.sourceLabel || null,
      targetId: data.targetId,
      targetName: data.targetName || null,
    },
  });

  return NextResponse.json({ mapping }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.ZOHO_MANAGE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing mapping id" }, { status: 400 });
  }

  const existing = await db.zohoMapping.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
  }

  await db.zohoMapping.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

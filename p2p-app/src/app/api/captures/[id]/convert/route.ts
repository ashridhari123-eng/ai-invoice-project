import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { convertCaptureToInvoice } from "@/lib/capture-flow";

const ConvertSchema = z.object({
  poId: z.string().min(1, "Purchase order is required"),
  invoiceNumber: z.string().trim().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tdsSection: z.string().optional().nullable(),
  tdsRate: z.coerce.number().min(0).max(30).optional().nullable(),
});

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
  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  try {
    const invoice = await db.$transaction((tx) =>
      convertCaptureToInvoice(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        captureId: id,
        data: parsed.data,
        ip: clientIp(request),
      }),
    );
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

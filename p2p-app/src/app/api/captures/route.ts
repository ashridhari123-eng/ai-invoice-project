import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { CAP_CAPTURED, CAP_ERROR, sha256Hex } from "@/lib/captures";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  runExtraction,
} from "@/lib/capture-flow";

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.CAPTURES_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const captures = await db.capturedDocument.findMany({
    where: { orgId: user.orgId },
    include: {
      invoice: { select: { id: true, code: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ captures });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.CAPTURES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type ${file.type || "(unknown)"}. Upload a PDF or an image.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the 10 MB limit" },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileHash = sha256Hex(bytes.toString("base64"));

  const existing = await db.capturedDocument.findFirst({
    where: { orgId: user.orgId, fileHash },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This document has already been uploaded to the inbox" },
      { status: 409 },
    );
  }

  const base64 = bytes.toString("base64");

  try {
    const capture = await db.$transaction(async (tx) => {
      const created = await tx.capturedDocument.create({
        data: {
          orgId: user.orgId,
          status: CAP_CAPTURED,
          fileName: `${crypto.randomUUID()}.${EXT[file.type] ?? "bin"}`,
          originalName: file.name,
          mimeType: file.type,
          fileHash,
          sizeBytes: file.size,
          storedPath: "",
          storedData: base64,
          createdById: user.id,
        },
      });
      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "CAPTURE",
        entityId: created.id,
        action: "UPLOAD",
        after: { originalName: file.name, sizeBytes: file.size },
        ip: clientIp(request),
      });
      return created;
    });

    const result = await db.$transaction(async (tx) => {
      try {
        return await runExtraction(tx, {
          orgId: user.orgId,
          captureId: capture.id,
          base64,
          mimeType: file.type,
          actorId: user.id,
          actorEmail: user.email,
          ip: clientIp(request),
        });
      } catch (extractErr) {
        await tx.capturedDocument.update({
          where: { id: capture.id },
          data: {
            status: CAP_ERROR,
            error:
              extractErr instanceof Error
                ? extractErr.message
                : "Extraction failed",
          },
        });
        throw extractErr;
      }
    });

    return NextResponse.json({ ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

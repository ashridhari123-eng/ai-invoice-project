import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { CAP_ERROR } from "@/lib/captures";
import { runExtraction } from "@/lib/capture-flow";

function readSourceBytes(capture: {
  storedData: string | null;
  storedPath: string;
}): Buffer | null {
  if (capture.storedData) {
    return Buffer.from(capture.storedData, "base64");
  }
  if (!capture.storedPath) return null;
  try {
    return readFileSync(path.join(process.cwd(), capture.storedPath));
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.CAPTURES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const capture = await db.capturedDocument.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!capture) {
    return NextResponse.json({ error: "Captured document not found" }, { status: 404 });
  }

  const bytes = readSourceBytes(capture);
  if (!bytes) {
    return NextResponse.json({ error: "Source file is missing" }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      try {
        return await runExtraction(tx, {
          orgId: user.orgId,
          captureId: id,
          base64: bytes.toString("base64"),
          mimeType: capture.mimeType,
          actorId: user.id,
          actorEmail: user.email,
          ip: clientIp(request),
        });
      } catch (extractErr) {
        await tx.capturedDocument.update({
          where: { id },
          data: {
            status: CAP_ERROR,
            error:
              extractErr instanceof Error ? extractErr.message : "Extraction failed",
          },
        });
        throw extractErr;
      }
    });
    return NextResponse.json({ ...result });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

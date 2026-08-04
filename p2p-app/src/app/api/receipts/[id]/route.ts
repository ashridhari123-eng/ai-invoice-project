import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.RECEIPTS_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const receipt = await db.goodsReceipt.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      lines: true,
      purchaseOrder: {
        include: {
          vendor: true,
          lines: true,
          requisition: {
            include: { requester: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!receipt) {
    return NextResponse.json({ error: "Goods receipt not found" }, { status: 404 });
  }

  return NextResponse.json({ receipt });
}

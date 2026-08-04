import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.PO_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      vendor: true,
      requisition: {
        include: { requester: { select: { name: true, email: true } } },
      },
      lines: { orderBy: { itemCode: "asc" } },
    },
  });

  if (!purchaseOrder) {
    return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  }

  return NextResponse.json({ purchaseOrder });
}

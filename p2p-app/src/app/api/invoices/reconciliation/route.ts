import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import {
  INV_APPROVED,
  INV_BOOKED,
  SYNC_SUCCESS,
} from "@/lib/invoices";

export async function GET() {
  const { error, user } = await requireApiAuth(PERMISSIONS.INVOICES_READ);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const approvedNotBooked = await db.invoice.findMany({
    where: {
      orgId: user.orgId,
      status: INV_APPROVED,
      syncStatus: { not: SYNC_SUCCESS },
    },
    include: { vendor: { select: { legalName: true } } },
    orderBy: { decidedAt: "desc" },
  });

  const bookedNotPaid = await db.invoice.findMany({
    where: { orgId: user.orgId, status: INV_BOOKED, paidAt: null },
    include: { vendor: { select: { legalName: true } } },
    orderBy: { bookedAt: "desc" },
  });

  const config = await db.zohoConfig.findUnique({ where: { orgId: user.orgId } });

  return NextResponse.json({
    connected: Boolean(config?.isActive),
    approvedNotBooked,
    bookedNotPaid,
    zohoOnly: [],
    drift: [],
  });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import {
  INV_RECEIVED,
  INV_MATCHED,
  INV_SUBMITTED,
  MATCH_UNMATCHED,
} from "@/lib/invoices";
import { findMatchingRule, startApprovalInstance } from "@/lib/workflow";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error, user } = await requireApiAuth(PERMISSIONS.INVOICES_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  const invoice = await db.invoice.findFirst({
    where: { id, orgId: user.orgId },
    include: { lines: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (![INV_RECEIVED, INV_MATCHED].includes(invoice.status)) {
    return NextResponse.json(
      { error: "Only received or matched invoices can be submitted for approval" },
      { status: 400 },
    );
  }

  const unmatched = invoice.lines.filter((l) => l.matchStatus === MATCH_UNMATCHED);
  if (unmatched.length > 0) {
    return NextResponse.json(
      { error: `Run matching first — ${unmatched.length} line(s) have no purchase order match` },
      { status: 400 },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const rule = await findMatchingRule(tx, user.orgId, "INV", invoice.totalAmount);
    if (!rule) {
      throw new Error("No approval route is configured for invoices");
    }

    const updated = await tx.invoice.update({
      where: { id },
      data: { status: INV_SUBMITTED, submittedAt: new Date() },
    });

    const instance = await startApprovalInstance(tx, {
      orgId: user.orgId,
      docType: "INV",
      docId: id,
      ruleId: rule.id,
      submittedById: user.id,
      amount: invoice.totalAmount,
      entity: "INVOICE",
      ip: clientIp(request),
    });

    return { invoice: updated, instance, rule };
  });

  return NextResponse.json({
    invoice: result.invoice,
    instance: result.instance,
    rule: result.rule,
  });
}

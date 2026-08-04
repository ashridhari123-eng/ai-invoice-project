import { db } from "@/lib/db";
import {
  SYNC_NONE,
  SYNC_PENDING,
  SYNC_SUCCESS,
  SYNC_FAILED,
  INV_BOOKED,
  INV_PAID,
} from "@/lib/invoices";
import {
  pushVendorToZoho,
  pushBillToZoho,
  zohoFetch,
} from "@/lib/zoho";

export async function isZohoConfigured(orgId: string): Promise<boolean> {
  const config = await db.zohoConfig.findUnique({ where: { orgId } });
  return Boolean(config?.isActive);
}

export async function syncVendorToZoho(orgId: string, vendorId: string) {
  const vendor = await db.vendor.findUnique({ where: { id: vendorId, orgId } });
  if (!vendor) throw new Error("Vendor not found");

  if (!(await isZohoConfigured(orgId))) {
    throw new Error("Zoho Books is not connected yet");
  }

  const contactId = await pushVendorToZoho(orgId, {
    contactName: vendor.legalName,
    companyName: vendor.legalName,
    gstin: vendor.gstin ?? undefined,
    paymentTermsDays: vendor.paymentTermsDays,
  });

  await db.vendor.update({
    where: { id: vendorId },
    data: { zohoContactId: contactId, syncStatus: SYNC_SUCCESS, syncError: null },
  });

  return { contactId };
}

export async function pushInvoiceToZoho(orgId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, orgId },
    include: {
      vendor: true,
      purchaseOrder: { select: { code: true } },
      lines: { orderBy: { lineNo: "asc" } },
    },
  });
  if (!invoice) throw new Error("Invoice not found");

  if (!(await isZohoConfigured(orgId))) {
    throw new Error("Zoho Books is not connected yet");
  }

  let contactId = invoice.vendor.zohoContactId;
  if (!contactId) {
    const pushed = await syncVendorToZoho(orgId, invoice.vendorId);
    contactId = pushed.contactId;
  }

  const taxMappings = await db.zohoMapping.findMany({
    where: { orgId, kind: "TAX_RATE" },
  });
  const taxByRate = new Map(
    taxMappings.map((m) => [m.sourceKey, m.targetId]),
  );

  const accountMappings = await db.zohoMapping.findMany({
    where: { orgId, kind: "ACCOUNT_CATEGORY" },
  });
  const accountByCategory = new Map(
    accountMappings.map((m) => [m.sourceKey, m.targetId]),
  );

  const lineItems = invoice.lines.map((l) => {
    const taxId = taxByRate.get(String(l.taxRatePct));
    if (!taxId) {
      throw new Error(`No Zoho tax mapping for GST ${l.taxRatePct}%`);
    }
    const category = invoice.vendor.category ?? "DEFAULT";
    const accountId = accountByCategory.get(category);
    if (!accountId) {
      throw new Error(`No Zoho expense account mapping for ${category}`);
    }
    return {
      name: l.name,
      quantity: l.qty,
      rate: l.unitPrice,
      hsnOrSac: l.hsnSac,
      taxId,
      accountId,
    };
  });

  const result = await pushBillToZoho(orgId, {
    vendorId: contactId,
    billNumber: invoice.invoiceNumber,
    date: invoice.invoiceDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
    referenceNumber: invoice.purchaseOrder?.code ?? invoice.code,
    lineItems,
    isTdsApplicable: Boolean(invoice.tdsRate && invoice.tdsRate > 0),
  });

  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        zohoBillId: result.billId,
        zohoBillNumber: result.billNumber,
        status: INV_BOOKED,
        bookedAt: new Date(),
        syncStatus: SYNC_SUCCESS,
        syncError: null,
      },
    });
    await tx.syncLog.create({
      data: {
        orgId,
        entity: "INVOICE",
        entityId: invoiceId,
        direction: "OUT",
        zohoId: result.billId,
        status: SYNC_SUCCESS,
        responseJson: JSON.stringify({ bill_id: result.billId }),
      },
    });
  });

  return { billId: result.billId, billNumber: result.billNumber };
}

export async function markSyncPending(orgId: string, invoiceId: string) {
  await db.invoice.update({
    where: { id: invoiceId },
    data: { syncStatus: SYNC_PENDING },
  });
}

export async function markSyncFailed(
  orgId: string,
  invoiceId: string,
  message: string,
) {
  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { syncStatus: SYNC_FAILED, syncError: message.slice(0, 500) },
    });
    await tx.syncLog.create({
      data: {
        orgId,
        entity: "INVOICE",
        entityId: invoiceId,
        direction: "OUT",
        status: SYNC_FAILED,
        lastError: message.slice(0, 500),
      },
    });
  });
}

export function syncLabel(status: string): string {
  switch (status) {
    case SYNC_NONE:
      return "Not synced";
    case SYNC_PENDING:
      return "Sync pending";
    case SYNC_SUCCESS:
      return "Synced to Zoho";
    case SYNC_FAILED:
      return "Sync failed";
    default:
      return status;
  }
}

export interface ZohoVendorPaymentApplied {
  invoice_id: string;
  invoice_number?: string;
  amount_applied?: number;
}

export interface ZohoVendorPayment {
  payment_id: string;
  payment_number?: string;
  date: string;
  reference_number?: string;
  amount?: number;
  invoices?: ZohoVendorPaymentApplied[];
}

export interface PullPaymentsResult {
  paymentsChecked: number;
  billsUpdated: number;
  alreadyPaid: number;
  updated: Array<{ invoiceId: string; paidAt: string; paymentRef: string }>;
}

export async function pullPaidBillsToZoho(
  orgId: string,
): Promise<PullPaymentsResult> {
  if (!(await isZohoConfigured(orgId))) {
    throw new Error("Zoho Books is not connected yet");
  }

  const payments: ZohoVendorPayment[] = [];
  let page = 1;
  for (;;) {
    const data = await zohoFetch<{
      vendor_payments?: ZohoVendorPayment[];
      page_context?: { has_more_page?: boolean };
    }>(orgId, `/vendorpayments?page=${page}&per_page=200`);
    const batch = data.vendor_payments ?? [];
    payments.push(...batch);
    if (!data.page_context?.has_more_page || batch.length === 0) break;
    page += 1;
  }

  const appliedBillIds = [
    ...new Set(
      payments.flatMap((p) => p.invoices ?? []).map((i) => i.invoice_id),
    ),
  ].filter((id): id is string => Boolean(id));

  const booked = await db.invoice.findMany({
    where: { orgId, zohoBillId: { in: appliedBillIds } },
    select: { id: true, zohoBillId: true, status: true, paidAt: true },
  });
  const invoiceByBillId = new Map(
    booked.map((inv) => [inv.zohoBillId, inv]),
  );

  let billsUpdated = 0;
  let alreadyPaid = 0;
  const updated: PullPaymentsResult["updated"] = [];

  for (const payment of payments) {
    const date = new Date(payment.date);
    if (Number.isNaN(date.getTime())) continue;
    const paymentRef =
      payment.payment_number ?? payment.reference_number ?? null;

    for (const applied of payment.invoices ?? []) {
      const invoice = invoiceByBillId.get(applied.invoice_id);
      if (!invoice) continue;
      if (invoice.paidAt) {
        alreadyPaid += 1;
        continue;
      }

      await db.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: INV_PAID,
            paidAt: date,
            paymentRef: paymentRef ? String(paymentRef).slice(0, 200) : null,
          },
        });
        await tx.syncLog.create({
          data: {
            orgId,
            entity: "INVOICE",
            entityId: invoice.id,
            direction: "IN",
            zohoId: applied.invoice_id,
            status: SYNC_SUCCESS,
            responseJson: JSON.stringify({
              payment_id: payment.payment_id,
              payment_number: payment.payment_number ?? null,
              date: payment.date,
              amount_applied: applied.amount_applied ?? null,
            }),
          },
        });
      });

      updated.push({
        invoiceId: invoice.id,
        paidAt: date.toISOString(),
        paymentRef: paymentRef ?? "",
      });
      billsUpdated += 1;
    }
  }

  if (payments.length > 0) {
    await db.zohoConfig.update({
      where: { orgId },
      data: { lastSyncAt: new Date() },
    });
  }

  return { paymentsChecked: payments.length, billsUpdated, alreadyPaid, updated };
}

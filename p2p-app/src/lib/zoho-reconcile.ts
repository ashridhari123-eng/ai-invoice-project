import { db } from "@/lib/db";
import { zohoFetch } from "@/lib/zoho";
import { isZohoConfigured } from "@/lib/zoho-sync";

export interface ZohoBillSummary {
  bill_id: string;
  bill_number?: string;
  status?: string;
  total?: number;
}

interface ZohoBillsResponse {
  bills?: ZohoBillSummary[];
  page_context?: { has_more_page?: boolean };
}

async function fetchAllBills(orgId: string): Promise<ZohoBillSummary[]> {
  const bills: ZohoBillSummary[] = [];
  let page = 1;
  for (;;) {
    const data = await zohoFetch<ZohoBillsResponse>(
      orgId,
      `/bills?page=${page}&per_page=200`,
    );
    const batch = data.bills ?? [];
    bills.push(...batch);
    if (!data.page_context?.has_more_page || batch.length === 0) break;
    page += 1;
  }
  return bills;
}

export interface ZohoOnlyBill {
  billId: string;
  billNumber: string;
  total: number | null;
  status: string;
}

export interface DriftRow {
  invoiceId: string;
  invoiceCode: string;
  billId: string;
  billNumber: string;
  ours: number;
  zoho: number;
  delta: number;
}

export interface ReconcileResult {
  checked: number;
  zohoOnly: ZohoOnlyBill[];
  drift: DriftRow[];
}

export async function runZohoReconciliation(
  orgId: string,
): Promise<ReconcileResult> {
  if (!(await isZohoConfigured(orgId))) {
    throw new Error("Zoho Books is not connected yet");
  }

  const bills = await fetchAllBills(orgId);
  const ours = await db.invoice.findMany({
    where: { orgId, zohoBillId: { not: null } },
    select: {
      id: true,
      code: true,
      zohoBillId: true,
      zohoBillNumber: true,
      totalAmount: true,
    },
  });
  const oursByBillId = new Map(ours.map((inv) => [inv.zohoBillId, inv]));

  const zohoOnly: ZohoOnlyBill[] = [];
  const drift: DriftRow[] = [];

  for (const bill of bills) {
    const inv = oursByBillId.get(bill.bill_id);
    if (!inv) {
      zohoOnly.push({
        billId: bill.bill_id,
        billNumber: bill.bill_number ?? bill.bill_id,
        total: bill.total ?? null,
        status: bill.status ?? "—",
      });
      continue;
    }

    const zohoTotal = bill.total ?? 0;
    const delta = Math.abs(zohoTotal - inv.totalAmount);
    if (delta > 0.01) {
      drift.push({
        invoiceId: inv.id,
        invoiceCode: inv.code,
        billId: bill.bill_id,
        billNumber: bill.bill_number ?? inv.zohoBillNumber ?? bill.bill_id,
        ours: inv.totalAmount,
        zoho: zohoTotal,
        delta,
      });
    }
  }

  return { checked: bills.length, zohoOnly, drift };
}

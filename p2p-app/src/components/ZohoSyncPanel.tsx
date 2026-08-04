"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Table, Th, Td, Badge } from "@/components/ui";
import { formatINR } from "@/lib/format";

interface PullResult {
  paymentsChecked: number;
  billsUpdated: number;
  alreadyPaid: number;
}

interface ZohoOnlyBill {
  billId: string;
  billNumber: string;
  total: number | null;
  status: string;
}

interface DriftRow {
  invoiceCode: string;
  billId: string;
  billNumber: string;
  ours: number;
  zoho: number;
  delta: number;
}

interface ReconcileResult {
  checked: number;
  zohoOnly: ZohoOnlyBill[];
  drift: DriftRow[];
}

export default function ZohoSyncPanel({
  connected,
  canManage,
}: {
  connected: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"pull" | "reconcile" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pull, setPull] = useState<PullResult | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);

  async function runPull() {
    setBusy("pull");
    setError(null);
    try {
      const res = await fetch("/api/zoho/pull", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Payment pull failed");
        return;
      }
      setPull({
        paymentsChecked: data.paymentsChecked ?? 0,
        billsUpdated: data.billsUpdated ?? 0,
        alreadyPaid: data.alreadyPaid ?? 0,
      });
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function runReconcile() {
    setBusy("reconcile");
    setError(null);
    try {
      const res = await fetch("/api/zoho/reconcile", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Reconciliation failed");
        return;
      }
      setReconcile({
        checked: data.checked ?? 0,
        zohoOnly: data.zohoOnly ?? [],
        drift: data.drift ?? [],
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!connected) return null;

  return (
    <div className="rounded-lg border border-line bg-card shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            Close the loop
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Pull payments recorded in Zoho Books back into the app, then check
            for bills booked outside the process and amount drift.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={runPull} disabled={busy !== null}>
              {busy === "pull" ? "Pulling…" : "Pull payments"}
            </Button>
            <Button onClick={runReconcile} disabled={busy !== null}>
              {busy === "reconcile" ? "Reconciling…" : "Run reconciliation"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {pull ? (
        <p className="mt-3 rounded-md bg-teal/10 px-3 py-2 text-sm text-teal">
          {pull.billsUpdated > 0
            ? `${pull.billsUpdated} payment${pull.billsUpdated === 1 ? "" : "s"} pulled back · invoice${pull.billsUpdated === 1 ? "" : "s"} marked paid.`
            : "No new payments found."}
          {" "}
          ({pull.paymentsChecked} payments checked, {pull.alreadyPaid} already recorded)
        </p>
      ) : null}

      {reconcile ? (
        <div className="mt-4 space-y-4">
          {reconcile.zohoOnly.length === 0 && reconcile.drift.length === 0 ? (
            <p className="rounded-md bg-teal/10 px-3 py-2 text-sm text-teal">
              All {reconcile.checked} Zoho bills tie out against the app. No
              bypassed bills and no drift.
            </p>
          ) : null}

          {reconcile.zohoOnly.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Billed in Zoho, missing in app
                <span className="ml-2">
                  <Badge tone="amber">{reconcile.zohoOnly.length}</Badge>
                </span>
              </h3>
              <p className="mb-2 mt-0.5 text-xs text-ink-soft">
                Someone booked these directly in Zoho Books, bypassing the
                process.
              </p>
              <Table>
                <thead>
                  <tr>
                    <Th>Bill no.</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {reconcile.zohoOnly.map((b) => (
                    <tr key={b.billId}>
                      <Td className="font-mono text-xs text-ink">{b.billNumber}</Td>
                      <Td className="text-right font-mono text-xs text-ink">
                        {b.total != null ? formatINR(b.total) : "—"}
                      </Td>
                      <Td>
                        <Badge tone={b.status === "paid" ? "teal" : "gray"}>
                          {b.status}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}

          {reconcile.drift.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Amount drift
                <span className="ml-2">
                  <Badge tone="red">{reconcile.drift.length}</Badge>
                </span>
              </h3>
              <p className="mb-2 mt-0.5 text-xs text-ink-soft">
                Paired records whose totals differ between the app and Zoho.
              </p>
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Bill no.</Th>
                    <Th className="text-right">App</Th>
                    <Th className="text-right">Zoho</Th>
                    <Th className="text-right">Delta</Th>
                  </tr>
                </thead>
                <tbody>
                  {reconcile.drift.map((d) => (
                    <tr key={d.billId}>
                      <Td className="font-mono text-xs text-ink">{d.invoiceCode}</Td>
                      <Td className="font-mono text-xs text-ink-soft">{d.billNumber}</Td>
                      <Td className="text-right font-mono text-xs text-ink">
                        {formatINR(d.ours)}
                      </Td>
                      <Td className="text-right font-mono text-xs text-ink">
                        {formatINR(d.zoho)}
                      </Td>
                      <Td className="text-right font-mono text-xs font-semibold text-red-700">
                        {formatINR(d.delta)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

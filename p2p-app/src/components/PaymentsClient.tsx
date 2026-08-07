"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
  Field,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  StatusBadge,
} from "@/components/ui";
import { formatINR, formatINRFull, formatDate } from "@/lib/format";

export interface PaymentInvoice {
  id: string;
  code: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  totalAmount: number;
  paidAt: string | null;
  paymentRef: string | null;
  advanceApplied: number;
  vendor: { code: string; legalName: string };
}

type Tab = "DUE" | "PAID";

const initialForm = {
  invoiceId: "",
  paidAt: new Date().toISOString().slice(0, 10),
  reference: "",
  amount: "",
  notes: "",
};

export default function PaymentsClient({
  invoices,
  canWrite,
}: {
  invoices: PaymentInvoice[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("DUE");
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => invoices.find((inv) => inv.id === form.invoiceId) ?? null,
    [form.invoiceId, invoices],
  );
  const due = selected
    ? Math.round((selected.totalAmount - selected.advanceApplied) * 100) / 100
    : 0;

  const dueInvoices = invoices.filter((inv) => inv.status !== "PAID");
  const paidInvoices = invoices.filter((inv) => inv.status === "PAID");
  const shown = tab === "DUE" ? dueInvoices : paidInvoices;

  const dueTotal = dueInvoices.reduce((s, inv) => s + dueFor(inv), 0);
  const paidTotal = paidInvoices.reduce((s, inv) => s + inv.totalAmount, 0);

  function update(key: keyof typeof initialForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectInvoice(id: string) {
    const inv = invoices.find((i) => i.id === id);
    const remaining = inv
      ? Math.round((inv.totalAmount - inv.advanceApplied) * 100) / 100
      : 0;
    setForm((f) => ({
      ...f,
      invoiceId: id,
      amount: remaining > 0 ? String(remaining) : "",
      paidAt: new Date().toISOString().slice(0, 10),
      reference: "",
      notes: "",
    }));
    setError(null);
  }

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: form.invoiceId,
          paidAt: form.paidAt,
          reference: form.reference,
          amount: form.amount === "" ? undefined : Number(form.amount),
          notes: form.notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not record payment");
        return;
      }
      setForm(initialForm);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-5">
      {error ? (
        <p className="mb-4 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-paper/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Outstanding to pay
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">
            {formatINR(dueTotal)}
          </p>
          <p className="text-xs text-ink-soft">
            {dueInvoices.length} invoice{dueInvoices.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-paper/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Paid to date
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-teal">
            {formatINR(paidTotal)}
          </p>
          <p className="text-xs text-ink-soft">
            {paidInvoices.length} invoice{paidInvoices.length === 1 ? "" : "s"} marked paid
          </p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {(["DUE", "PAID"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors " +
              (tab === t
                ? "bg-nav text-white"
                : "border border-line bg-card text-ink hover:border-ink-soft")
            }
          >
            {t === "DUE" ? `Due · ${dueInvoices.length}` : `Paid · ${paidInvoices.length}`}
          </button>
        ))}
      </div>

      {canWrite && tab === "DUE" ? (
        <form
          onSubmit={handleRecord}
          className="mb-6 rounded-lg border border-pink/30 bg-pink/5 p-5"
        >
          <h3 className="font-display text-base font-semibold text-ink">
            Record payment
          </h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            Mark an approved or booked invoice as paid with a bank reference.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Invoice">
              <Select
                required
                value={form.invoiceId}
                onChange={(e) => selectInvoice(e.target.value)}
              >
                <option value="">Select invoice</option>
                {dueInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.code} · {inv.invoiceNumber} · {inv.vendor.legalName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment date">
              <Input
                type="date"
                required
                value={form.paidAt}
                onChange={(e) => update("paidAt", e.target.value)}
              />
            </Field>
            <Field label="Reference">
              <Input
                required
                value={form.reference}
                onChange={(e) => update("reference", e.target.value)}
                placeholder="Cheque / UTR / bank ref"
              />
            </Field>
            <Field label="Amount (INR)">
              <Input
                type="number"
                required
                min={0}
                step="0.01"
                max={due}
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                placeholder={selected ? String(due) : "0.00"}
              />
            </Field>
            <Field label="Notes (optional)">
              <Input
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
          </div>

          {selected ? (
            <p className="mt-3 text-xs text-ink-soft">
              Invoice total{" "}
              <span className="font-mono font-medium text-ink">
                {formatINRFull(selected.totalAmount)}
              </span>
              {" · "}advance applied{" "}
              <span className="font-mono font-medium text-ink">
                {formatINRFull(selected.advanceApplied)}
              </span>
              {" · "}due{" "}
              <span className="font-mono font-medium text-ink">
                {formatINRFull(due)}
              </span>
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-2">
            <Button type="submit" disabled={loading || !selected || due <= 0}>
              {loading ? "Recording…" : "Record payment"}
            </Button>
            {form.invoiceId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm(initialForm)}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          message={
            tab === "DUE"
              ? "No invoices due for payment. Approved or booked invoices will appear here."
              : "No payments recorded yet."
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Vendor</Th>
              <Th>Invoice #</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Advance</Th>
              <Th className="text-right">Due</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((inv) => {
              const remaining = dueFor(inv);
              return (
                <tr key={inv.id} className="hover:bg-paper/40">
                  <Td>
                    <p className="font-mono text-xs font-semibold text-pink">
                      {inv.code}
                    </p>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {inv.vendor.code}
                    </p>
                  </Td>
                  <Td>
                    <p className="text-xs font-medium text-ink">
                      {inv.vendor.legalName}
                    </p>
                  </Td>
                  <Td className="font-mono text-xs text-ink">
                    {inv.invoiceNumber}
                  </Td>
                  <Td className="text-right font-mono text-sm font-medium text-ink">
                    {formatINR(inv.totalAmount)}
                  </Td>
                  <Td className="text-right font-mono text-sm text-ink-soft">
                    {formatINRFull(inv.advanceApplied)}
                  </Td>
                  <Td className="text-right font-mono text-sm text-ink">
                    {formatINRFull(remaining)}
                  </Td>
                  <Td>
                    <StatusBadge status={inv.status} />
                  </Td>
                  <Td>
                    {inv.status === "PAID" ? (
                      <div className="text-xs">
                        <Badge tone="teal">
                          {inv.paymentRef ?? "Paid"}
                        </Badge>
                        {inv.paidAt ? (
                          <p className="mt-1 whitespace-nowrap font-mono text-[10px] text-ink-soft">
                            {formatDate(inv.paidAt)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-soft">Not paid</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function dueFor(inv: PaymentInvoice): number {
  return Math.round((inv.totalAmount - inv.advanceApplied) * 100) / 100;
}

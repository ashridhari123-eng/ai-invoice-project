"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR, formatDateTime } from "@/lib/format";
import { Button, Input, Select, Field, Card } from "@/components/ui";

export interface SentPOOption {
  id: string;
  code: string;
  vendorName: string;
  vendorCode: string;
  totalAmount: number;
  lineCount: number;
  tdsSection: string | null;
  tdsRate: number | null;
  sentAt: Date | string | null;
}

const TDS_SECTIONS = ["194C", "194J", "194Q", "194I", "194M"];

export default function InvoiceCreateForm({
  purchaseOrders,
}: {
  purchaseOrders: SentPOOption[];
}) {
  const router = useRouter();
  const [poId, setPoId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState("");
  const [tdsSection, setTdsSection] = useState("");
  const [tdsRate, setTdsRate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = purchaseOrders.find((po) => po.id === poId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId,
          invoiceNumber,
          invoiceDate,
          dueDate: dueDate || null,
          tdsSection: tdsSection || null,
          tdsRate: tdsRate === "" ? null : Number(tdsRate),
          notes: notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create invoice");
        return;
      }
      router.push(`/invoices/${data.invoice.id}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      {error ? (
        <p className="rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      <Card className="space-y-4 p-5">
        <Field label="Purchase order">
          <Select value={poId} onChange={(e) => setPoId(e.target.value)} required>
            <option value="">Select a sent purchase order…</option>
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.code} · {po.vendorName} · {formatINR(po.totalAmount)}
              </option>
            ))}
          </Select>
        </Field>

        {selected ? (
          <div className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ink">{selected.vendorName}</p>
              <p className="font-mono text-xs text-ink-soft">{selected.vendorCode}</p>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {selected.lineCount} line{selected.lineCount === 1 ? "" : "s"} ·{" "}
              {formatINR(selected.totalAmount)} · sent{" "}
              {selected.sentAt ? formatDateTime(selected.sentAt) : "—"}
            </p>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <Field label="Vendor invoice number" hint="The number printed on the vendor's bill.">
          <Input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="e.g. SIS/2026/0187"
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Invoice date">
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="TDS section">
            <Select value={tdsSection} onChange={(e) => setTdsSection(e.target.value)}>
              <option value="">None</option>
              {TDS_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="TDS rate (%)">
            <Input
              type="number"
              min="0"
              max="30"
              step="0.1"
              value={tdsRate}
              onChange={(e) => setTdsRate(e.target.value)}
              placeholder={selected?.tdsRate != null ? String(selected.tdsRate) : "0"}
            />
          </Field>
        </div>

        <Field label="Notes">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
          />
        </Field>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy || !poId}>
          {busy ? "Saving…" : "Record invoice"}
        </Button>
      </div>
    </form>
  );
}

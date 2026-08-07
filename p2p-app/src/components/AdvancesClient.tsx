"use client";

import { useState } from "react";
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
} from "@/components/ui";
import { formatINR, formatINRFull, formatDate } from "@/lib/format";
import { advanceStatusFor } from "@/lib/advances";

interface AdvanceApp {
  id: string;
  amount: number;
  appliedAt: string;
  invoice: { code: string; invoiceNumber: string };
}

export interface AdvanceRow {
  id: string;
  code: string;
  amount: number;
  currency: string;
  advanceDate: string;
  reference: string | null;
  notes: string | null;
  status: string;
  vendor: { id: string; code: string; legalName: string };
  purchaseOrder: { code: string } | null;
  applications: AdvanceApp[];
}

interface VendorRow {
  id: string;
  code: string;
  legalName: string;
}

interface PoRow {
  id: string;
  code: string;
  vendorId: string;
}

interface InvoiceRow {
  id: string;
  code: string;
  invoiceNumber: string;
  vendorId: string;
  totalAmount: number;
  status: string;
}

const STATUS_TONE: Record<string, "teal" | "amber" | "blue" | "gray" | "red"> = {
  RECORDED: "blue",
  PARTIALLY_APPLIED: "amber",
  APPLIED: "teal",
  REVERSED: "red",
};

const initialForm = {
  vendorId: "",
  poId: "",
  amount: "",
  advanceDate: new Date().toISOString().slice(0, 10),
  reference: "",
  notes: "",
};

export default function AdvancesClient({
  advances,
  vendors,
  purchaseOrders,
  invoices,
  canWrite,
}: {
  advances: AdvanceRow[];
  vendors: VendorRow[];
  purchaseOrders: PoRow[];
  invoices: InvoiceRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyForm, setApplyForm] = useState({ invoiceId: "", amount: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof initialForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const vendorPois = purchaseOrders.filter(
    (po) => po.vendorId === form.vendorId,
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          poId: form.poId || null,
          reference: form.reference || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not record advance");
        return;
      }
      setForm(initialForm);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function openApply(advance: AdvanceRow) {
    setApplyingId(advance.id);
    setApplyForm({ invoiceId: "", amount: "" });
    setError(null);
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!applyingId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/advances/${applyingId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: applyForm.invoiceId,
          amount: Number(applyForm.amount),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not apply advance");
        return;
      }
      setApplyingId(null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const applying = advances.find((a) => a.id === applyingId);
  const applyingVendorInvoices = applying
    ? invoices.filter((inv) => inv.vendorId === applying.vendor.id)
    : [];

  return (
    <div className="p-5">
      {error ? (
        <p className="mb-4 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {canWrite ? (
        <div className="mb-5">
          <Button type="button" onClick={() => setOpen((o) => !o)}>
            {open ? "Close form" : "+ Record advance"}
          </Button>

          {open ? (
            <form
              onSubmit={handleCreate}
              className="mt-4 rounded-lg border border-line bg-paper/40 p-5"
            >
              <h3 className="font-display text-base font-semibold text-ink">
                Record advance payment
              </h3>
              <p className="mt-0.5 text-sm text-ink-soft">
                An advance code is generated automatically (ADV/…).
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Vendor">
                  <Select
                    required
                    value={form.vendorId}
                    onChange={(e) =>
                      update("vendorId", e.target.value)
                    }
                  >
                    <option value="">Select vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.legalName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Purchase order (optional)">
                  <Select
                    value={form.poId}
                    onChange={(e) => update("poId", e.target.value)}
                  >
                    <option value="">No PO</option>
                    {vendorPois.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Advance date">
                  <Input
                    type="date"
                    required
                    value={form.advanceDate}
                    onChange={(e) => update("advanceDate", e.target.value)}
                  />
                </Field>
                <Field label="Amount (INR)">
                  <Input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => update("amount", e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Reference (optional)">
                  <Input
                    value={form.reference}
                    onChange={(e) => update("reference", e.target.value)}
                    placeholder="Cheque / UTR / bank ref"
                  />
                </Field>
                <Field label="Notes (optional)">
                  <Input
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                  />
                </Field>
              </div>

              <div className="mt-5 flex items-center gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving…" : "Record advance"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {applying ? (
        <form
          onSubmit={handleApply}
          className="mb-5 rounded-lg border border-pink/30 bg-pink/5 p-5"
        >
          <h3 className="font-display text-base font-semibold text-ink">
            Apply {applying.code} to an invoice
          </h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            Unapplied balance:{" "}
            <span className="font-mono font-medium text-ink">
              {formatINRFull(remainingFor(applying))}
            </span>
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Invoice">
              <Select
                required
                value={applyForm.invoiceId}
                onChange={(e) =>
                  setApplyForm((f) => ({ ...f, invoiceId: e.target.value }))
                }
              >
                <option value="">Select invoice</option>
                {applyingVendorInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.code} · {inv.invoiceNumber} · {formatINR(inv.totalAmount)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount to apply (INR)">
              <Input
                type="number"
                required
                min={0}
                step="0.01"
                max={remainingFor(applying)}
                value={applyForm.amount}
                onChange={(e) =>
                  setApplyForm((f) => ({ ...f, amount: e.target.value }))
                }
                placeholder="0.00"
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Applying…" : "Apply advance"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setApplyingId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {advances.length === 0 ? (
        <EmptyState message="No advances recorded yet. Record an advance paid to a vendor to start." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Vendor</Th>
              <Th>Date</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Applied</Th>
              <Th className="text-right">Remaining</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {advances.map((advance) => {
              const remaining = remainingFor(advance);
              const status = advanceStatusFor(advance.amount, advance.applications);
              return (
                <tr key={advance.id} className="align-top hover:bg-paper/40">
                  <Td>
                    <p className="font-mono text-xs font-semibold text-pink">
                      {advance.code}
                    </p>
                    {advance.reference ? (
                      <p className="font-mono text-[10px] text-ink-soft">
                        {advance.reference}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    <p className="text-xs font-medium text-ink">
                      {advance.vendor.legalName}
                    </p>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {advance.purchaseOrder?.code ?? "No PO"}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    <span suppressHydrationWarning>
                      {formatDate(advance.advanceDate)}
                    </span>
                  </Td>
                  <Td className="text-right font-mono text-sm font-medium text-ink">
                    {formatINR(advance.amount)}
                  </Td>
                  <Td className="text-right font-mono text-sm text-ink-soft">
                    {formatINRFull(advance.amount - remaining)}
                  </Td>
                  <Td className="text-right font-mono text-sm text-ink">
                    {formatINRFull(remaining)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[status] ?? "gray"}>
                      {status.replace("_", " ")}
                    </Badge>
                    {advance.applications.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {advance.applications.map((app) => (
                          <li
                            key={app.id}
                            className="font-mono text-[10px] text-ink-soft"
                          >
                            {formatINR(app.amount)} → {app.invoice.code}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Td>
                  <Td>
                    {canWrite && remaining > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="px-2.5 py-1 text-xs"
                        disabled={applyingId !== null && applyingId !== advance.id}
                        onClick={() => openApply(advance)}
                      >
                        Apply to invoice
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-soft">—</span>
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

function remainingFor(advance: AdvanceRow): number {
  const applied = advance.applications.reduce((s, a) => s + a.amount, 0);
  return Math.round((advance.amount - applied) * 100) / 100;
}

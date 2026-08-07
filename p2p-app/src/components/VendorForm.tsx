"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Field } from "@/components/ui";

const initialForm = {
  legalName: "",
  tradeName: "",
  pan: "",
  gstin: "",
  msmeNumber: "",
  msmeType: "",
  category: "",
  paymentTermsDays: "30",
  tdsSection: "",
  tdsRate: "",
  accountName: "",
  accountNumber: "",
  ifsc: "",
};

export default function VendorForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof initialForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          paymentTermsDays: Number(form.paymentTermsDays),
          tdsRate: form.tdsRate === "" ? null : Number(form.tdsRate),
          bankAccount:
            form.accountName || form.accountNumber || form.ifsc
              ? {
                  accountName: form.accountName,
                  accountNumber: form.accountNumber,
                  ifsc: form.ifsc,
                }
              : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create vendor");
        return;
      }
      setForm(initialForm);
      setOpen(false);
      onDone?.();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button type="button" onClick={() => setOpen((o) => !o)}>
        {open ? "Close form" : "+ New vendor"}
      </Button>

      {open ? (
        <form
          onSubmit={handleSubmit}
          className="mt-4 rounded-lg border border-line bg-card p-5"
        >
          <h3 className="font-display text-base font-semibold text-ink">
            Register vendor
          </h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            VAT: a vendor code is generated automatically.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Legal name" hint="Name as per PAN / GST certificate">
              <Input
                required
                value={form.legalName}
                onChange={(e) => update("legalName", e.target.value)}
                placeholder="Acme Industries Pvt Ltd"
              />
            </Field>
            <Field label="Trade name (optional)">
              <Input
                value={form.tradeName}
                onChange={(e) => update("tradeName", e.target.value)}
                placeholder="Acme"
              />
            </Field>
            <Field label="PAN" hint="Format: ABCDE1234F">
              <Input
                required
                value={form.pan}
                onChange={(e) => update("pan", e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                maxLength={10}
              />
            </Field>
            <Field label="GSTIN (optional)">
              <Input
                value={form.gstin}
                onChange={(e) => update("gstin", e.target.value.toUpperCase())}
                placeholder="27ABCDE1234F1Z5"
                maxLength={15}
              />
            </Field>
            <Field label="MSME number (optional)">
              <Input
                value={form.msmeNumber}
                onChange={(e) => update("msmeNumber", e.target.value)}
                placeholder="UDYAM-XX-00-0000000"
              />
            </Field>
            <Field label="MSME type">
              <Select
                value={form.msmeType}
                onChange={(e) => update("msmeType", e.target.value)}
              >
                <option value="">Not MSME</option>
                <option value="MICRO">Micro</option>
                <option value="SMALL">Small</option>
                <option value="MEDIUM">Medium</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
              >
                <option value="">Select category</option>
                <option value="RAW_MATERIAL">Raw Material</option>
                <option value="CONSUMABLES">Consumables</option>
                <option value="SERVICES">Services</option>
                <option value="CAPITAL_EQUIPMENT">Capital Equipment</option>
                <option value="OFFICE_SUPPLIES">Office Supplies</option>
                <option value="LOGISTICS">Logistics</option>
              </Select>
            </Field>
            <Field label="Payment terms (days)">
              <Input
                type="number"
                min={0}
                max={180}
                value={form.paymentTermsDays}
                onChange={(e) => update("paymentTermsDays", e.target.value)}
              />
            </Field>
            <Field label="TDS section (optional)">
              <Input
                value={form.tdsSection}
                onChange={(e) => update("tdsSection", e.target.value)}
                placeholder="194C"
                maxLength={8}
              />
            </Field>
            <Field label="TDS rate % (optional)">
              <Input
                type="number"
                min={0}
                max={20}
                step="0.5"
                value={form.tdsRate}
                onChange={(e) => update("tdsRate", e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Bank account (optional)
            </h4>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Account holder name">
                <Input
                  value={form.accountName}
                  onChange={(e) => update("accountName", e.target.value)}
                />
              </Field>
              <Field label="Account number">
                <Input
                  value={form.accountNumber}
                  onChange={(e) => update("accountNumber", e.target.value)}
                />
              </Field>
              <Field label="IFSC">
                <Input
                  value={form.ifsc}
                  onChange={(e) => update("ifsc", e.target.value.toUpperCase())}
                  placeholder="HDFC0001234"
                  maxLength={11}
                />
              </Field>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Register vendor"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

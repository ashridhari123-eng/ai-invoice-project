"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Field } from "@/components/ui";

const initialForm = {
  name: "",
  description: "",
  hsnSac: "",
  unit: "each",
  defaultTaxRatePct: "18",
};

export default function ItemForm({ onDone }: { onDone?: () => void }) {
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
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          defaultTaxRatePct: Number(form.defaultTaxRatePct),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create item");
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
        {open ? "Close form" : "+ New item"}
      </Button>

      {open ? (
        <form
          onSubmit={handleSubmit}
          className="mt-4 rounded-lg border border-line bg-card p-5"
        >
          <h3 className="font-display text-base font-semibold text-ink">
            Add catalog item
          </h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            A sequential item code is generated automatically.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Item name">
              <Input
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ball bearing 6205"
              />
            </Field>
            <Field label="HSN / SAC code" hint="4 or 6 digit code">
              <Input
                required
                value={form.hsnSac}
                onChange={(e) => update("hsnSac", e.target.value)}
                placeholder="8482"
                maxLength={6}
                inputMode="numeric"
              />
            </Field>
            <Field label="Unit of measure">
              <Select
                value={form.unit}
                onChange={(e) => update("unit", e.target.value)}
              >
                <option value="each">Each (no.)</option>
                <option value="pcs">Pieces (pcs)</option>
                <option value="box">Box</option>
                <option value="set">Set</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="m">Metre (m)</option>
                <option value="litre">Litre</option>
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="lump-sum">Lump sum</option>
              </Select>
            </Field>
            <Field label="Default GST rate">
              <Select
                value={form.defaultTaxRatePct}
                onChange={(e) => update("defaultTaxRatePct", e.target.value)}
              >
                <option value="0">0% (exempt)</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description (optional)">
                <Input
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Specification, brand preference, etc."
                />
              </Field>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Add item"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Field, Card } from "@/components/ui";

interface ItemOption {
  id: string;
  code: string;
  name: string;
  hsnSac: string;
  unit: string;
  defaultTaxRatePct: number;
}

interface BudgetOption {
  id: string;
  department: string;
  category: string;
  period: string;
  allocatedAmount: number;
  spentAmount: number;
  committedAmount: number;
}

interface LineRow {
  key: number;
  itemId: string;
  qty: string;
  unitPrice: string;
  taxRatePct: string;
  name: string;
  unit: string;
  hsnSac: string;
}

let rowKey = 0;

function money(value: number): string {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function formatINR(value: number): string {
  return "₹" + money(value);
}

function lineTotals(qty: number, unitPrice: number, taxPct: number) {
  const subtotal = Math.round(qty * unitPrice * 100) / 100;
  const tax = Math.round(subtotal * taxPct * 100) / 10000;
  return { subtotal, tax, total: subtotal + tax };
}

export default function RequisitionForm({
  userDepartment,
  departments,
  items,
  budgets,
}: {
  userDepartment: string | null;
  departments: string[];
  items: ItemOption[];
  budgets: BudgetOption[];
}) {
  const router = useRouter();
  const [department, setDepartment] = useState(
    userDepartment && departments.includes(userDepartment)
      ? userDepartment
      : departments[0] ?? "",
  );
  const [budgetId, setBudgetId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([
    { key: ++rowKey, itemId: "", qty: "", unitPrice: "", taxRatePct: "18", name: "", unit: "", hsnSac: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"draft" | "submit" | null>(null);

  const itemById = new Map(items.map((i) => [i.id, i]));

  function changeDepartment(value: string) {
    setDepartment(value);
    const budget = budgets.find((b) => b.id === budgetId);
    if (budget && budget.department !== value) setBudgetId("");
  }

  function addLine() {
    setLines((ls) => [
      ...ls,
      { key: ++rowKey, itemId: "", qty: "", unitPrice: "", taxRatePct: "18", name: "", unit: "", hsnSac: "" },
    ]);
  }

  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  function updateLine(key: number, patch: Partial<LineRow>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function selectItem(key: number, itemId: string) {
    const item = itemById.get(itemId);
    updateLine(key, {
      itemId,
      name: item ? item.name : "",
      unit: item ? item.unit : "",
      hsnSac: item ? item.hsnSac : "",
      taxRatePct: item ? String(item.defaultTaxRatePct) : "18",
    });
  }

  const budgetOptions = budgets.filter(
    (b) => department === "" || b.department === department,
  );
  const selectedBudget = budgets.find((b) => b.id === budgetId);

  const totals = lines.reduce(
    (acc, l) => {
      const qty = Number(l.qty) || 0;
      const price = Number(l.unitPrice) || 0;
      const tax = Number(l.taxRatePct) || 0;
      const t = lineTotals(qty, price, tax);
      acc.subtotal += t.subtotal;
      acc.tax += t.tax;
      acc.total += t.total;
      return acc;
    },
    { subtotal: 0, tax: 0, total: 0 },
  );

  const available =
    selectedBudget && !Number.isNaN(Number(selectedBudget.allocatedAmount))
      ? selectedBudget.allocatedAmount -
        selectedBudget.spentAmount -
        selectedBudget.committedAmount
      : null;

  function validate(): string | null {
    if (lines.length === 0) return "Add at least one line item";
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.itemId) return `Line ${i + 1}: select an item`;
      if (!(Number(l.qty) > 0)) return `Line ${i + 1}: quantity must be positive`;
      if (Number(l.unitPrice) < 0) return `Line ${i + 1}: price cannot be negative`;
    }
    if (selectedBudget && available !== null && totals.total > available) {
      return `Insufficient budget. Available: ${formatINR(available)}`;
    }
    return null;
  }

  async function create(): Promise<{ id: string } | null> {
    const payload = {
      department,
      expectedDeliveryDate: expectedDeliveryDate || null,
      notes: notes || null,
      budgetId: budgetId || null,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        qty: Number(l.qty),
        unitPrice: Number(l.unitPrice),
        taxRatePct: Number(l.taxRatePct),
      })),
    };

    const res = await fetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "Could not create requisition");
    }
    return data.requisition;
  }

  async function handleSave(submitAfter: boolean) {
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(submitAfter ? "submit" : "draft");
    try {
      const created = await create();
      if (!created) return;

      if (submitAfter) {
        const res = await fetch(`/api/requisitions/${created.id}/submit`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Saved, but could not submit for approval");
          router.push(`/requisitions/${created.id}`);
          router.refresh();
          return;
        }
      }

      router.push(`/requisitions/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <div className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Department">
            <Select value={department} onChange={(e) => changeDepartment(e.target.value)}>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Budget line" hint="Optional, but recommended for procurement">
            <Select value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
              <option value="">No budget line</option>
              {budgetOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.category.replace("_", " ")} · {b.period}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Need by date">
            <Input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            />
          </Field>
        </div>

        {selectedBudget ? (
          <div className="mt-4 rounded-md bg-paper px-3 py-2 text-xs text-ink-soft">
            {selectedBudget.category.replace("_", " ")} budget:{" "}
            <span className="font-mono font-medium text-ink">
              {formatINR(selectedBudget.allocatedAmount)}
            </span>{" "}
            allocated · {formatINR(selectedBudget.committedAmount)} committed ·{" "}
            <span className="font-mono font-medium text-teal">
              {formatINR(available ?? 0)} available
            </span>
          </div>
        ) : null}

        <div className="mt-5">
          <h3 className="font-display text-base font-semibold text-ink">Line items</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Item
                  </th>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Qty
                  </th>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Unit price
                  </th>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    GST
                  </th>
                  <th className="border-b border-line px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Total
                  </th>
                  <th className="border-b border-line px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, index) => {
                  const t = lineTotals(Number(l.qty) || 0, Number(l.unitPrice) || 0, Number(l.taxRatePct) || 0);
                  return (
                    <tr key={l.key}>
                      <td className="border-b border-line px-3 py-2">
                        <Select
                          value={l.itemId}
                          onChange={(e) => selectItem(l.key, e.target.value)}
                          className="min-w-[220px]"
                        >
                          <option value="">Select item…</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.code} — {i.name}
                            </option>
                          ))}
                        </Select>
                        {l.name ? (
                          <p className="mt-1 font-mono text-[10px] text-ink-soft">
                            {l.name} · {l.unit} · HSN {l.hsnSac}
                          </p>
                        ) : null}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0"
                          value={l.qty}
                          onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                          className="w-20"
                        />
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0.00"
                          value={l.unitPrice}
                          onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                          className="w-28"
                        />
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <Select
                          value={l.taxRatePct}
                          onChange={(e) => updateLine(l.key, { taxRatePct: e.target.value })}
                          className="w-20"
                        >
                          {[0, 5, 12, 18, 28].map((t) => (
                            <option key={t} value={t}>
                              {t}%
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="border-b border-line px-3 py-2 text-right font-mono text-sm font-medium text-ink">
                        {formatINR(t.total)}
                      </td>
                      <td className="border-b border-line px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(l.key)}
                          disabled={lines.length === 1}
                          className="text-xs text-ink-soft hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Remove line ${index + 1}`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2">
            <Button type="button" variant="outline" onClick={addLine}>
              + Add line
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-end gap-6 border-t border-line pt-4">
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Subtotal</p>
              <p className="font-mono text-sm font-medium text-ink">{formatINR(totals.subtotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tax</p>
              <p className="font-mono text-sm font-medium text-ink">{formatINR(totals.tax)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Total</p>
              <p className="font-display text-lg font-bold text-pink">{formatINR(totals.total)}</p>
            </div>
          </div>

          <div className="mt-4">
            <Field label="Notes">
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Justification, delivery location, brand preference…"
              />
            </Field>
          </div>

          {error ? (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={loading !== null} onClick={() => handleSave(false)}>
              {loading === "draft" ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" variant="ghost" disabled={loading !== null} onClick={() => handleSave(true)}>
              {loading === "submit" ? "Submitting…" : "Save & submit for approval"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

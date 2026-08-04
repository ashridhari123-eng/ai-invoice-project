"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

export interface QuoteLineInput {
  id: string;
  itemCode: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export default function QuoteForm({
  rfqId,
  quoteId,
  vendorName,
  lines,
  onDone,
}: {
  rfqId: string;
  quoteId: string;
  vendorName: string;
  lines: QuoteLineInput[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, String(l.unitPrice)])),
  );
  const [freight, setFreight] = useState("0");
  const [packing, setPacking] = useState("0");
  const [otherCharges, setOtherCharges] = useState("0");
  const [advancePct, setAdvancePct] = useState("0");
  const [creditDays, setCreditDays] = useState("0");
  const [deliveryDays, setDeliveryDays] = useState("0");
  const [warrantyMonths, setWarrantyMonths] = useState("0");
  const [validityDays, setValidityDays] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const unitPrices = Object.fromEntries(
        Object.entries(prices).map(([k, v]) => [k, Number(v)]),
      );
      const res = await fetch(`/api/rfqs/${rfqId}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          unitPrices,
          freight: Number(freight),
          packing: Number(packing),
          otherCharges: Number(otherCharges),
          advancePct: Number(advancePct),
          creditDays: Number(creditDays),
          deliveryDays: Number(deliveryDays),
          warrantyMonths: Number(warrantyMonths),
          validityDays: Number(validityDays),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-paper/60">
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Item
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Qty
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Unit price
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <p className="text-xs font-medium text-ink">{l.name}</p>
                  <p className="font-mono text-[10px] text-ink-soft">{l.itemCode}</p>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-ink">
                  {l.qty} {l.unit}
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={prices[l.id]}
                    onChange={(e) =>
                      setPrices((prev) => ({ ...prev, [l.id]: e.target.value }))
                    }
                    className="w-32 py-1 text-right"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Freight">
          <Input type="number" min={0} step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} />
        </Field>
        <Field label="Packing">
          <Input type="number" min={0} step="0.01" value={packing} onChange={(e) => setPacking(e.target.value)} />
        </Field>
        <Field label="Other charges">
          <Input type="number" min={0} step="0.01" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} />
        </Field>
        <Field label="Advance %">
          <Input type="number" min={0} max={100} value={advancePct} onChange={(e) => setAdvancePct(e.target.value)} />
        </Field>
        <Field label="Credit days">
          <Input type="number" min={0} max={365} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
        </Field>
        <Field label="Delivery (days)">
          <Input type="number" min={0} max={730} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} />
        </Field>
        <Field label="Warranty (months)">
          <Input type="number" min={0} max={120} value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} />
        </Field>
        <Field label="Quote validity (days)">
          <Input type="number" min={0} max={365} value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
        </Field>
      </div>

      <Field label="Notes from vendor (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <Button type="button" disabled={busy} onClick={submit}>
        {busy ? "Submitting…" : `Record quote from ${vendorName}`}
      </Button>
    </div>
  );
}

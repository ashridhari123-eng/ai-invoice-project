"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, Input, Table, Th, Td } from "@/components/ui";
import { formatINR } from "@/lib/format";

export interface ReceiptLineOption {
  id: string;
  itemCode: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  received: number;
}

export default function ReceiptForm({
  poId,
  poCode,
  vendorName,
  lines,
}: {
  poId: string;
  poCode: string;
  vendorName: string;
  lines: ReceiptLineOption[];
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.id, String(l.qty - l.received)]),
    ),
  );
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReceivedAt(new Date().toISOString().slice(0, 10));
  }, []);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    const receiptLines = lines
      .map((l) => ({
        poLineId: l.id,
        qtyReceived: Number(quantities[l.id] ?? 0),
      }))
      .filter((l) => l.qtyReceived > 0);

    if (receiptLines.length === 0) {
      setError("Enter a quantity for at least one line.");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId,
          receivedAt: receivedAt || null,
          notes: notes.trim() || null,
          lines: receiptLines,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      router.push(`/receipts/${data.receipt.id}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={`Receive against ${poCode}`}
        subtitle={`${vendorName} · open lines only`}
      />
      <Table>
        <thead>
          <tr>
            <Th>Item</Th>
            <Th className="text-right">Ordered</Th>
            <Th className="text-right">Already received</Th>
            <Th className="text-right">Remaining</Th>
            <Th className="text-right">Receiving now</Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const remaining = l.qty - l.received;
            const value = quantities[l.id] ?? "0";
            const over = Number(value) > remaining;
            return (
              <tr key={l.id} className="hover:bg-paper/40">
                <Td>
                  <p className="text-sm font-medium text-ink">{l.name}</p>
                  <p className="font-mono text-[10px] text-ink-soft">
                    {l.itemCode} · {formatINR(l.unitPrice)} / {l.unit}
                  </p>
                </Td>
                <Td className="text-right font-mono text-sm text-ink">{l.qty}</Td>
                <Td className="text-right font-mono text-sm text-ink-soft">{l.received}</Td>
                <Td className="text-right font-mono text-sm text-ink">{remaining}</Td>
                <Td className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step={1}
                    value={value}
                    onChange={(e) =>
                      setQuantities((prev) => ({ ...prev, [l.id]: e.target.value }))
                    }
                    className={`w-24 ${over ? "border-red-400" : ""}`}
                  />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="space-y-4 border-t border-line px-5 py-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Received on">
            <Input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </Field>
          <Field label="Notes (optional)">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Challan / DC / LR number…"
            />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" disabled={busy} onClick={handleSubmit}>
            {busy ? "Saving…" : "Record receipt"}
          </Button>
          <span className="text-xs text-ink-soft">
            Exceeding the ordered quantity is blocked.
          </span>
        </div>
      </div>
    </Card>
  );
}

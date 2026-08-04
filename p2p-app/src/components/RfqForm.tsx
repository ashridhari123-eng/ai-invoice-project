"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";

export interface RfqRequisitionOption {
  id: string;
  code: string;
  department: string;
  totalAmount: number;
  lineCount: number;
  requestedBy: string;
}

export interface RfqVendorOption {
  id: string;
  code: string;
  legalName: string;
  rating: number;
}

export default function RfqForm({
  requisitions,
  vendors,
}: {
  requisitions: RfqRequisitionOption[];
  vendors: RfqVendorOption[];
}) {
  const router = useRouter();
  const [requisitionId, setRequisitionId] = useState("");
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [needByDate, setNeedByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleVendor(id: string) {
    setSelectedVendors((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisitionId,
          vendorIds: selectedVendors,
          needByDate: needByDate || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      router.push(`/rfqs/${data.rfq.id}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const selected = requisitions.find((r) => r.id === requisitionId);

  return (
    <Card>
      <CardHeader title="RFQ details" subtitle="Source requisition and invited vendors" />
      <div className="max-w-2xl space-y-4 px-5 py-5">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <Field label="Approved requisition">
          <select
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-pink focus:outline-none focus:ring-2 focus:ring-pink/20"
            value={requisitionId}
            onChange={(e) => setRequisitionId(e.target.value)}
          >
            <option value="">Select a requisition…</option>
            {requisitions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.department} · {r.lineCount} lines
              </option>
            ))}
          </select>
          {selected ? (
            <span className="mt-1 block text-xs text-ink-soft">
              {selected.lineCount} line(s) · {selected.requestedBy}
            </span>
          ) : null}
        </Field>

        <Field label="Vendors to invite" hint="Multiple vendors can be invited to quote.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {vendors.map((v) => (
              <label
                key={v.id}
                className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                  selectedVendors.includes(v.id)
                    ? "border-pink bg-pink/5"
                    : "border-line bg-white hover:border-ink-soft"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedVendors.includes(v.id)}
                    onChange={() => toggleVendor(v.id)}
                    className="accent-[#E23D7B]"
                  />
                  <span className="text-ink">{v.legalName}</span>
                </span>
                <span className="font-mono text-[10px] text-ink-soft">{v.code}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Need by date (optional)">
          <Input type="date" value={needByDate} onChange={(e) => setNeedByDate(e.target.value)} />
        </Field>

        <Field label="Notes (optional)">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Scope, delivery expectations…"
          />
        </Field>

        <Button
          className="w-full sm:w-auto"
          disabled={busy || !requisitionId || selectedVendors.length === 0}
          onClick={create}
        >
          {busy ? "Creating…" : "Create RFQ"}
        </Button>
      </div>
    </Card>
  );
}

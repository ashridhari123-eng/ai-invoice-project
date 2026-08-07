"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";

interface VendorOption {
  id: string;
  legalName: string;
  code: string;
  email: string | null;
  currency: string;
  paymentTermsDays: number;
}

export default function ConvertToPO({ requisitionId }: { requisitionId: string }) {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/vendors")
      .then((res) => res.json())
      .then((data: { vendors: VendorOption[] }) => setVendors(data.vendors))
      .catch(() => setError("Could not load vendors"));
  }, []);

  function selectVendor(id: string) {
    setVendorId(id);
    const vendor = vendors.find((v) => v.id === id);
    if (vendor) setPaymentTermsDays(vendor.paymentTermsDays);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisitionId,
          vendorId,
          paymentTermsDays,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      router.push(`/purchase-orders/${data.purchaseOrder.id}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      <div className="space-y-3">
        <Field label="Vendor">
          <Select value={vendorId} onChange={(e) => selectVendor(e.target.value)}>
            <option value="">Select a vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.legalName} · {v.code}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Payment terms (days)">
          <Input
            type="number"
            min={0}
            max={180}
            value={paymentTermsDays}
            onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
          />
        </Field>

        <Field label="Notes (optional)">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Shown on the purchase order…"
          />
        </Field>

        <Button type="button" className="w-full" disabled={busy || !vendorId} onClick={create}>
          {busy ? "Creating…" : "Create purchase order"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";

const CATEGORIES = [
  "CAPEX",
  "RAW_MATERIAL",
  "IT_EQUIPMENT",
  "OFFICE_SUPPLIES",
  "SERVICES",
  "OPERATIONS",
  "OTHER",
];

export default function BudgetForm({
  departments,
}: {
  departments: string[];
}) {
  const router = useRouter();
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [period, setPeriod] = useState("FY2026");
  const [allocatedAmount, setAllocatedAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    const amount = Number(allocatedAmount);
    if (!department || !category || !period || !(amount > 0)) {
      setError("Fill in department, category, period, and a positive limit.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, category, period, allocatedAmount: amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setDepartment("");
      setCategory("");
      setAllocatedAmount("");
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Department">
          <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Select department…</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value="IT">IT</option>
            <option value="Operations">Operations</option>
            <option value="Finance">Finance</option>
            <option value="Procurement">Procurement</option>
            <option value="Sales">Sales</option>
            <option value="HR">HR</option>
            <option value="Facilities">Facilities</option>
            <option value="Marketing">Marketing</option>
          </Select>
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select category…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Period">
          <Input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="FY2026"
          />
        </Field>
        <Field label="Spending limit (₹)">
          <Input
            type="number"
            min={0}
            value={allocatedAmount}
            onChange={(e) => setAllocatedAmount(e.target.value)}
            placeholder="500000"
          />
        </Field>
      </div>
      <div className="mt-4">
        <Button type="button" disabled={busy} onClick={handleSubmit}>
          {busy ? "Saving…" : "Create budget"}
        </Button>
      </div>
    </div>
  );
}

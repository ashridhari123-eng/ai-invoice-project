"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, Table, Th, Td, EmptyState } from "@/components/ui";

export interface VendorRow {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  pan: string;
  gstin: string | null;
  status: string;
  category: string | null;
  paymentTermsDays: number;
  currency: string;
  msmeType: string | null;
  bankCount: number;
  createdAt: string;
}

export default function VendorTable({
  vendors,
  canWrite,
}: {
  vendors: VendorRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await fetch(`/api/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete vendor “${name}”? This cannot be undone.`)) {
      return;
    }
    setBusyId(id);
    try {
      await fetch(`/api/vendors/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (vendors.length === 0) {
    return <EmptyState message="No vendors yet. Register your first vendor to get started." />;
  }

  return (
    <Table>
      <thead>
        <tr>
          <Th>Code</Th>
          <Th>Vendor</Th>
          <Th>PAN / GSTIN</Th>
          <Th>Category</Th>
          <Th>Terms</Th>
          <Th>Status</Th>
          <Th>Bank</Th>
          {canWrite ? <Th>Actions</Th> : null}
        </tr>
      </thead>
      <tbody>
        {vendors.map((v) => (
          <tr key={v.id} className="hover:bg-paper/40">
            <Td>
              <span className="font-mono text-xs font-medium text-ink">{v.code}</span>
            </Td>
            <Td>
              <p className="font-medium text-ink">{v.legalName}</p>
              {v.tradeName ? <p className="text-xs text-ink-soft">{v.tradeName}</p> : null}
            </Td>
            <Td>
              <p className="font-mono text-xs text-ink">{v.pan}</p>
              {v.gstin ? (
                <p className="font-mono text-xs text-ink-soft">{v.gstin}</p>
              ) : (
                <p className="text-xs text-ink-soft/60">No GSTIN</p>
              )}
            </Td>
            <Td>
              <p className="text-xs text-ink">
                {v.category ? v.category.replace("_", " ") : "—"}
              </p>
              {v.msmeType ? <p className="text-xs text-ink-soft">{v.msmeType}</p> : null}
            </Td>
            <Td className="text-xs text-ink">
              {v.paymentTermsDays}d · {v.currency}
            </Td>
            <Td>
              <StatusBadge status={v.status} />
            </Td>
            <Td className="text-xs text-ink-soft">{v.bankCount} account(s)</Td>
            {canWrite ? (
              <Td>
                <div className="flex items-center gap-2">
                  {v.status === "ACTIVE" ? (
                    <button
                      disabled={busyId === v.id}
                      onClick={() => setStatus(v.id, "BLOCKED")}
                      className="rounded border border-line px-2 py-1 text-xs font-medium text-ink transition-colors hover:border-red-400 hover:text-red-400"
                    >
                      Block
                    </button>
                  ) : (
                    <button
                      disabled={busyId === v.id}
                      onClick={() => setStatus(v.id, "ACTIVE")}
                      className="rounded border border-line px-2 py-1 text-xs font-medium text-ink transition-colors hover:border-teal hover:text-teal"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    disabled={busyId === v.id}
                    onClick={() => remove(v.id, v.legalName)}
                    className="rounded border border-line px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-950/60"
                  >
                    Delete
                  </button>
                </div>
              </Td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

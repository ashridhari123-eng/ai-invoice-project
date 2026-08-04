"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Table, Th, Td, EmptyState } from "@/components/ui";

export interface ItemRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  hsnSac: string;
  unit: string;
  defaultTaxRatePct: number;
  isActive: boolean;
}

export default function ItemTable({
  items,
  canWrite,
}: {
  items: ItemRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(id: string, isActive: boolean) {
    setBusyId(id);
    try {
      await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete item “${name}”? This cannot be undone.`)) {
      return;
    }
    setBusyId(id);
    try {
      await fetch(`/api/items/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <EmptyState message="No items yet. Add your first catalog item to get started." />;
  }

  return (
    <Table>
      <thead>
        <tr>
          <Th>Code</Th>
          <Th>Item</Th>
          <Th>HSN / SAC</Th>
          <Th>Unit</Th>
          <Th>GST rate</Th>
          <Th>Status</Th>
          {canWrite ? <Th>Actions</Th> : null}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="hover:bg-paper/40">
            <Td>
              <span className="font-mono text-xs font-medium text-ink">{item.code}</span>
            </Td>
            <Td>
              <p className="font-medium text-ink">{item.name}</p>
              {item.description ? (
                <p className="max-w-md truncate text-xs text-ink-soft">{item.description}</p>
              ) : null}
            </Td>
            <Td className="font-mono text-xs text-ink">{item.hsnSac}</Td>
            <Td className="text-xs text-ink">{item.unit}</Td>
            <Td className="text-xs text-ink">{item.defaultTaxRatePct}%</Td>
            <Td>
              {item.isActive ? (
                <Badge tone="teal">ACTIVE</Badge>
              ) : (
                <Badge tone="gray">INACTIVE</Badge>
              )}
            </Td>
            {canWrite ? (
              <Td>
                <div className="flex items-center gap-2">
                  <button
                    disabled={busyId === item.id}
                    onClick={() => toggle(item.id, !item.isActive)}
                    className="rounded border border-line px-2 py-1 text-xs font-medium text-ink transition-colors hover:border-teal hover:text-teal"
                  >
                    {item.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    disabled={busyId === item.id}
                    onClick={() => remove(item.id, item.name)}
                    className="rounded border border-line px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
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

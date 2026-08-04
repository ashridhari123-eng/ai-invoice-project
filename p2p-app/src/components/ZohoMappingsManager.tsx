"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Table, Th, Td, EmptyState } from "@/components/ui";

interface ZohoMappingRow {
  id: string;
  kind: string;
  sourceKey: string;
  sourceLabel: string | null;
  targetId: string;
  targetName: string | null;
}

const KIND_LABELS: Record<string, string> = {
  TAX_RATE: "GST rate",
  ACCOUNT_CATEGORY: "Expense category",
};

export default function ZohoMappingsManager({ connected }: { connected: boolean }) {
  const [mappings, setMappings] = useState<ZohoMappingRow[]>([]);
  const [kind, setKind] = useState<"TAX_RATE" | "ACCOUNT_CATEGORY">("TAX_RATE");
  const [sourceKey, setSourceKey] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [targetId, setTargetId] = useState("");
  const [targetName, setTargetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/zoho/mappings", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setMappings(data.mappings ?? []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/zoho/mappings", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMappings(data.mappings ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/zoho/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          sourceKey: sourceKey.trim(),
          sourceLabel: sourceLabel.trim(),
          targetId: targetId.trim(),
          targetName: targetName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save mapping");
        return;
      }
      setSourceKey("");
      setSourceLabel("");
      setTargetId("");
      setTargetName("");
      await load();
    } catch {
      setError("Could not save mapping");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/zoho/mappings?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await load();
    } catch {
      setError("Could not delete mapping");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            Zoho field mappings
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Map GST rates and expense categories to Zoho Books IDs before booking bills.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleAdd}
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as "TAX_RATE" | "ACCOUNT_CATEGORY")}
        >
          <option value="TAX_RATE">GST rate</option>
          <option value="ACCOUNT_CATEGORY">Expense category</option>
        </Select>
        <Input
          placeholder={kind === "TAX_RATE" ? "GST % (e.g. 18)" : "Category (e.g. DEFAULT)"}
          value={sourceKey}
          onChange={(e) => setSourceKey(e.target.value)}
          required
        />
        <Input
          placeholder="Source label (optional)"
          value={sourceLabel}
          onChange={(e) => setSourceLabel(e.target.value)}
        />
        <Input
          placeholder="Zoho target ID"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          required
        />
        <div className="flex items-center gap-2">
          <Input
            placeholder="Target name (optional)"
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
          />
          <Button type="submit" disabled={busy || !connected}>
            Add
          </Button>
        </div>
      </form>
      {!connected ? (
        <p className="mt-2 text-xs text-amber">
          Connect Zoho Books before saving mappings.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {mappings.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No mappings yet. Add a GST rate (e.g. 18 → tax id) and an expense category to start syncing bills." />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Source</Th>
              <Th>Target ID</Th>
              <Th>Target name</Th>
              <Th>&nbsp;</Th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className="hover:bg-paper/40">
                <Td className="text-xs text-ink">{KIND_LABELS[m.kind] ?? m.kind}</Td>
                <Td className="font-mono text-xs text-ink">
                  {m.sourceKey}
                  {m.sourceLabel ? (
                    <span className="text-ink-soft"> · {m.sourceLabel}</span>
                  ) : null}
                </Td>
                <Td className="font-mono text-xs text-ink">{m.targetId}</Td>
                <Td className="text-xs text-ink-soft">{m.targetName ?? "—"}</Td>
                <Td>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => handleDelete(m.id)}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

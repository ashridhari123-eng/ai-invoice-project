"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface ZohoStatus {
  connected: boolean;
  organizationId: string | null;
  clientId?: string | null;
  region: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

export default function ZohoConnectPanel({
  connected,
  organizationId,
  region,
  connectedAt,
  lastSyncAt,
  canManage,
}: ZohoStatus & { canManage: boolean }) {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ZohoStatus>({
    connected,
    organizationId,
    clientId: null,
    region,
    connectedAt,
    lastSyncAt,
  });
  const [error, setError] = useState<string | null>(null);

  const zohoParam = searchParams.get("zoho");
  const notice =
    zohoParam === "connected"
      ? "Zoho Books connected successfully."
      : zohoParam === "error"
        ? `Zoho connection failed: ${searchParams.get("reason") ?? "unknown error"}`
        : null;

  async function refresh() {
    const res = await fetch("/api/zoho/config", { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/zoho/connect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not start Zoho connection");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Zoho Books? Existing sync links will be kept.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/zoho/config", { method: "POST" });
      await refresh();
    } catch {
      setError("Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card shadow-sm p-5">
      {notice ? (
        <p
          className={
            "mb-3 rounded-md px-3 py-2 text-sm " +
            (zohoParam === "connected"
              ? "bg-teal/10 text-teal"
              : "bg-red-950/70 text-red-300")
          }
        >
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-ink">
            Zoho Books connection:{" "}
            <span
              className={
                status.connected ? "font-semibold text-teal" : "font-semibold text-amber"
              }
            >
              {status.connected ? "Connected" : "Not connected"}
            </span>
            {status.connected && status.organizationId ? (
              <span className="font-mono text-xs text-ink-soft">
                {" "}
                · org {status.organizationId}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {status.connected
              ? "Bills booked in Zoho are pulled back automatically to close the payment loop."
              : "Connect Zoho Books to unlock bill booking, payment pull-back, and drift checks."}
          </p>
          {status.connected && (status.connectedAt || status.lastSyncAt) ? (
            <p className="mt-1 font-mono text-[11px] text-ink-soft">
              {status.connectedAt
                ? `Connected ${formatDateTime(status.connectedAt)}`
                : ""}
              {status.lastSyncAt ? ` · last sync ${formatDateTime(status.lastSyncAt)}` : ""}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
        </div>

        {canManage ? (
          status.connected ? (
            <Button variant="outline" onClick={handleDisconnect} disabled={busy}>
              {busy ? "Working…" : "Disconnect"}
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={busy}>
              {busy ? "Starting…" : "Connect Zoho Books"}
            </Button>
          )
        ) : null}
      </div>

      {canManage && !status.connected ? (
        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
          A Zoho sign-in page opens in a new tab. After you approve, return here —
          the connection completes automatically.
        </p>
      ) : null}
    </div>
  );
}

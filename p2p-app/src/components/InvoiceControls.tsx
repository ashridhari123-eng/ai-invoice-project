"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function InvoiceControls({
  id,
  status,
  canSync,
}: {
  id: string;
  status: string;
  canSync: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string): Promise<boolean> {
    setBusy(action);
    setError(null);
    try {
      const endpoint =
        action === "match"
          ? `/api/invoices/${id}/match`
          : action === "submit"
            ? `/api/invoices/${id}/submit`
            : `/api/invoices/${id}/zoho-sync`;
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return false;
      }
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function match() {
    if (await act("match")) router.refresh();
  }

  async function submit() {
    if (await act("submit")) router.refresh();
  }

  async function sync() {
    if (await act("sync")) router.refresh();
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      {status === "RECEIVED" || status === "MATCHED" ? (
        <div className="space-y-2">
          <Button
            type="button"
            className="w-full"
            disabled={busy !== null}
            onClick={match}
          >
            {busy === "match" ? "Matching…" : "Run 2-way match against PO"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            onClick={submit}
          >
            {busy === "submit" ? "Submitting…" : "Submit for approval"}
          </Button>
        </div>
      ) : null}

      {canSync ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={busy !== null}
            onClick={sync}
          >
            {busy === "sync" ? "Booking in Zoho…" : "Book in Zoho Books"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

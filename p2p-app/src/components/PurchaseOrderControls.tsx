"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";

export default function PurchaseOrderControls({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function send() {
    setBusy("send");
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${id}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      {status === "DRAFT" ? (
        <Button
          type="button"
          className="w-full"
          disabled={busy !== null}
          onClick={send}
        >
          {busy === "send" ? "Sending…" : "Send to vendor"}
        </Button>
      ) : null}

      <div className="mt-3">
        <Link
          href={`/purchase-orders/${id}/pdf`}
          target="_blank"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-card px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-soft"
        >
          {status === "DRAFT" ? "Preview PO / PDF" : "Download PO PDF"}
        </Link>
      </div>
    </div>
  );
}

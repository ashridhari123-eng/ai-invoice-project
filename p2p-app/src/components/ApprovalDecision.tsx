"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

export default function ApprovalDecision({
  docType,
  id,
}: {
  docType: "PR" | "INV";
  id: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: "APPROVE" | "REJECT" | "SEND_BACK") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/${docType === "PR" ? "requisitions" : "invoices"}/${id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            comment: comment.trim() || null,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setComment("");
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
        <p className="mb-3 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <Field label="Comment (optional)">
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Decision note for the audit trail…"
        />
      </Field>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={() => decide("APPROVE")}>
          {busy ? "Saving…" : "Approve"}
        </Button>
        {docType === "PR" ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => decide("SEND_BACK")}
          >
            {busy ? "Saving…" : "Send back"}
          </Button>
        ) : null}
        <Button type="button" variant="danger" disabled={busy} onClick={() => decide("REJECT")}>
          {busy ? "Saving…" : "Reject"}
        </Button>
      </div>
    </div>
  );
}

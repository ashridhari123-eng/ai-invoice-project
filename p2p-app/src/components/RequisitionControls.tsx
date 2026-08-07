"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

export interface DecisionTarget {
  instanceId: string;
  canApprove: boolean;
}

export default function RequisitionControls({
  id,
  status,
  canSubmit,
  canWithdraw,
  canCancel,
  decision,
}: {
  id: string;
  status: string;
  canSubmit: boolean;
  canWithdraw: boolean;
  canCancel: boolean;
  decision: DecisionTarget | null;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string, init?: RequestInit): Promise<boolean> {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        action === "submit"
          ? `/api/requisitions/${id}/submit`
          : action === "withdraw" || action === "cancel"
            ? `/api/requisitions/${id}`
            : `/api/requisitions/${id}/decision`,
        init,
      );
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

  async function handleSubmit() {
    if (await act("submit", { method: "POST" })) router.refresh();
  }

  async function handleWithdraw() {
    if (await act("withdraw", { method: "PATCH" })) router.refresh();
  }

  async function handleCancel() {
    if (await act("cancel", { method: "DELETE" })) {
      router.push("/requisitions");
      router.refresh();
    }
  }

  async function handleDecision(decisionType: "APPROVE" | "REJECT" | "SEND_BACK") {
    const ok = await act("decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: decisionType,
        comment: comment.trim() || null,
      }),
    });
    if (ok) {
      setComment("");
      router.refresh();
    }
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {canSubmit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy !== null} onClick={handleSubmit}>
            {busy === "submit" ? "Submitting…" : status === "RETURNED" ? "Revise & resubmit" : "Submit for approval"}
          </Button>
          {status === "DRAFT" ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={handleCancel}>
              Delete draft
            </Button>
          ) : null}
        </div>
      ) : null}

      {canWithdraw ? (
        <div>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={handleWithdraw}>
            {busy === "withdraw" ? "Withdrawing…" : "Withdraw to draft"}
          </Button>
        </div>
      ) : null}

      {canCancel ? (
        <div>
          <Button type="button" variant="danger" disabled={busy !== null} onClick={handleCancel}>
            {busy === "cancel" ? "Cancelling…" : "Cancel requisition"}
          </Button>
        </div>
      ) : null}

      {decision?.canApprove ? (
        <div className="mt-2">
          <Field label="Comment (optional)">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Decision note for the audit trail…"
            />
          </Field>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy !== null} onClick={() => handleDecision("APPROVE")}>
              {busy === "decision" ? "Saving…" : "Approve"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => handleDecision("SEND_BACK")}
            >
              {busy === "decision" ? "Saving…" : "Send back"}
            </Button>
            <Button type="button" variant="danger" disabled={busy !== null} onClick={() => handleDecision("REJECT")}>
              {busy === "decision" ? "Saving…" : "Reject"}
            </Button>
          </div>
        </div>
      ) : null}

      <span className="sr-only">{status}</span>
    </div>
  );
}

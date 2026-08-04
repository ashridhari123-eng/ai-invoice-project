"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, CardHeader, Badge } from "@/components/ui";
import { formatINRFull } from "@/lib/format";

interface QuoteRow {
  id: string;
  vendorId: string;
  vendorName: string;
  status: string;
  comparableTotal: number;
  landedUnitCosts: number[];
  deliveryDays: number;
  creditDays: number;
  advancePct: number;
  rating: number;
  validityDays: number;
}

interface ScoreRow {
  quoteId: string;
  vendorName: string;
  comparableTotal: number;
  landedCost: number;
  delivery: number;
  paymentTerms: number;
  vendorRating: number;
  total: number;
}

interface Recommendation {
  recommended_vendor: string;
  reasoning: string;
  risks: string[];
  negotiation_tips: string[];
  mock?: boolean;
}

interface Award {
  id: string;
  quoteId: string;
  vendorId: string;
  vendorName: string;
  overrideReason: string | null;
  awardedAt: string;
  poId: string | null;
}

interface EvaluationState {
  scores: ScoreRow[];
  recommendation: Recommendation;
}

export default function ComparisonPanel({
  rfqId,
  initialStatus,
  initialQuotes,
  initialEvaluation,
  initialAward,
  canWrite,
  needByDate,
}: {
  rfqId: string;
  initialStatus: string;
  initialQuotes: QuoteRow[];
  initialEvaluation: EvaluationState | null;
  initialAward: Award | null;
  canWrite: boolean;
  needByDate: Date | string | null;
}) {
  const [, setStatus] = useState(initialStatus);
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);
  const [evaluation, setEvaluation] = useState<EvaluationState | null>(initialEvaluation);
  const [award, setAward] = useState<Award | null>(initialAward);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  async function refresh() {
    const res = await fetch(`/api/rfqs/${rfqId}`, { cache: "no-store" });
    const data = await res.json();
    const r = data.rfq;
    setStatus(r.status);
    setQuotes(r.quotes.filter((q: QuoteRow) => q.status === "SUBMITTED"));
    setEvaluation(
      r.evaluation
        ? {
            scores: JSON.parse(r.evaluation.scoresJson) as ScoreRow[],
            recommendation: JSON.parse(r.evaluation.recommendationJson) as Recommendation,
          }
        : null,
    );
    setAward(r.award ?? null);
  }

  async function evaluate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rfqs/${rfqId}/evaluate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Evaluation failed");
        return;
      }
      await refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function awardQuote(quoteId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rfqs/${rfqId}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          overrideReason: overrideFor === quoteId ? overrideReason.trim() || null : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Award failed");
        return;
      }
      await refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
      setOverrideFor(null);
      setOverrideReason("");
    }
  }

  const recommendedQuote = evaluation?.scores.find(
    (s) => s.vendorName === evaluation?.recommendation?.recommended_vendor,
  );

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <Card>
        <CardHeader
          title="Comparison & evaluation"
          subtitle={
            evaluation
              ? "Weighted scores (landed cost 50 · delivery 20 · terms 15 · rating 15) with an AI-written recommendation."
              : "Landed-cost normalisation and weighted scoring are computed in code; the recommendation is drafted by the LLM."
          }
          actions={
            canWrite && !award && evaluation === null ? (
              <Button disabled={busy || quotes.length < 2} onClick={evaluate}>
                {busy ? "Running…" : "Run AI comparison"}
              </Button>
            ) : null
          }
        />

        {evaluation === null ? (
          <p className="px-5 py-8 text-sm text-ink-soft">
            {quotes.length < 2
              ? "Submit quotes from at least two vendors to run the comparison."
              : "Ready to compare — click “Run AI comparison”."}
          </p>
        ) : (
          <div className="px-5 py-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                    <th className="py-2 pr-3 font-semibold">Vendor</th>
                    <th className="py-2 pr-3 text-right font-semibold">Landed cost</th>
                    <th className="py-2 pr-3 text-right font-semibold">Delivery</th>
                    <th className="py-2 pr-3 text-right font-semibold">Terms</th>
                    <th className="py-2 pr-3 text-right font-semibold">Rating</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.scores.map((s) => {
                    const isRecommended = s.vendorName === evaluation.recommendation.recommended_vendor;
                    return (
                      <tr key={s.quoteId} className="border-b border-line last:border-0">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-2 text-xs font-medium text-ink">
                            {s.vendorName}
                            {isRecommended ? (
                              <Badge tone="teal">AI pick</Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs text-ink">
                          {formatINRFull(s.comparableTotal)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs text-ink-soft">
                          {s.landedCost.toFixed(1)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs text-ink-soft">
                          {s.delivery.toFixed(1)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs text-ink-soft">
                          {s.paymentTerms.toFixed(1)}
                        </td>
                        <td className="py-2 text-right font-mono text-sm font-semibold text-ink">
                          {s.total.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg border border-teal/30 bg-teal/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal">
                    AI recommendation
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    Award to {evaluation.recommendation.recommended_vendor}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">{evaluation.recommendation.reasoning}</p>
                  {evaluation.recommendation.risks.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-ink-soft">
                      {evaluation.recommendation.risks.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                  {evaluation.recommendation.negotiation_tips.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-ink-soft">Negotiation tips</p>
                      <ul className="list-disc pl-5 text-xs text-ink-soft">
                        {evaluation.recommendation.negotiation_tips.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
              {evaluation.recommendation.mock ? (
                <p className="mt-2 text-xs text-amber">
                  Mock recommendation — set ANTHROPIC_API_KEY for a live LLM draft.
                </p>
              ) : null}
            </div>

            {award ? (
              <div className="mt-4 rounded-lg border border-line bg-paper/50 p-4">
                <p className="text-sm font-semibold text-ink">
                  Awarded to{" "}
                  {quotes.find((q) => q.id === award.quoteId)?.vendorName ?? "vendor"}
                </p>
                {award.overrideReason ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    Override reason: {award.overrideReason}
                  </p>
                ) : null}
                {award.poId ? (
                  <Link
                    href={`/purchase-orders/${award.poId}`}
                    className="mt-2 inline-block text-xs font-semibold text-pink hover:underline"
                  >
                    View purchase order →
                  </Link>
                ) : null}
              </div>
            ) : canWrite ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Buyer decision
                </p>
                {quotes.map((q) => (
                  <div key={q.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{q.vendorName}</p>
                      <p className="font-mono text-xs text-ink-soft">
                        {formatINRFull(q.comparableTotal)} · {q.deliveryDays}d delivery · {q.creditDays}d credit
                      </p>
                    </div>
                    {overrideFor === q.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="w-64 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-pink focus:outline-none"
                          placeholder="Override reason (required)…"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                        />
                        <Button
                          disabled={busy}
                          onClick={() => awardQuote(q.id)}
                        >
                          {busy ? "Awarding…" : "Confirm"}
                        </Button>
                        <Button variant="ghost" onClick={() => setOverrideFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant={q.vendorName === evaluation.recommendation.recommended_vendor ? "primary" : "outline"}
                        disabled={busy}
                        onClick={() => setOverrideFor(q.id)}
                      >
                        Award
                      </Button>
                    )}
                  </div>
                ))}
                {recommendedQuote && needByDate ? (
                  <p className="text-xs text-ink-soft">
                    Need-by {new Date(needByDate).toLocaleDateString("en-IN")} — check delivery fits.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}

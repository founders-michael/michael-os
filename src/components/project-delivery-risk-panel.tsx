"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, LoaderCircle, Sparkles } from "lucide-react";
import { notify } from "@/lib/notifications";
import { checkFigureContainment, describeContainmentFailure } from "@/lib/ai/figure-containment";

type Input = {
  key: string;
  available: boolean;
  normalised: number | null;
  weight: number;
  effectiveWeight: number | null;
  contribution: number | null;
  unavailableReason?: string;
  raw: Record<string, unknown>;
};

type Risk = {
  project: { id: string; name: string };
  score: number | null;
  band: string | null;
  scoreUnavailable: string | null;
  confidence: number;
  inputs: Input[];
  bandThresholds: Array<{ band: string; min: number; max: number }>;
  target: { date: string | null; source: string | null; daysRemaining: number | null };
  disclosures: Record<string, unknown>;
  forecast: { expectedCompletionDays: number | null; earliestCompletionDays: number | null; latestCompletionDays: number | null } | null;
  forecastUnavailable: string | null;
  error?: string;
};

const INPUT_LABELS: Record<string, string> = {
  capacityPressure: "Capacity pressure",
  blockedProportion: "Blocked work",
  deadlineProximity: "Deadline proximity",
  historicalSlip: "Historical slip",
};

const REASON_LABELS: Record<string, string> = {
  NO_ESTIMATED_WORK: "no estimated work",
  CAPACITY_SCOPE_UNAVAILABLE: "capacity not visible to you",
  NO_OPEN_TASKS: "no open tasks",
  NO_TARGET_DATE: "no target date set",
  INSUFFICIENT_SLIP_HISTORY: "not enough completed, dated tasks",
};

export default function ProjectDeliveryRiskPanel({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const base = `/api/organizations/${organizationId}/projects/${projectId}`;
  const [risk, setRisk] = useState<Risk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${base}/delivery-risk`);
      const body = await response.json() as Risk;
      if (!response.ok) throw new Error(body.error || "Delivery risk could not be loaded.");
      setRisk(body);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delivery risk could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  /**
   * Michael interprets the score; he never computes it. The figures he may use
   * are exactly those already on screen, so his answer is checked against the
   * same payload before it is shown.
   */
  async function askMichael() {
    if (!risk) return;
    setAsking(true);
    setAdvice("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: "work",
          organizationId,
          message: `Using get_project_delivery_risk for project ${projectId}, explain the delivery risk and recommend the two most useful actions. Quote only figures from the tool result.`,
          dataUseAcknowledged: true,
        }),
      });
      const body = await response.json() as { message?: { content?: string }; error?: string };
      if (!response.ok) throw new Error(body.error || "Michael could not respond.");
      const text = body.message?.content ?? "";
      const containment = checkFigureContainment(text, [risk]);
      if (!containment.contained) {
        // A figure Michael produced himself is not shown as if it were data.
        notify.error("Recommendation withheld", describeContainmentFailure(containment));
        setAdvice("");
        return;
      }
      setAdvice(text);
    } catch (cause) {
      notify.error("Michael could not respond", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setAsking(false);
    }
  }

  if (loading) return <section className="organization-panel"><p className="organization-empty">Loading delivery risk…</p></section>;
  if (error) return <section className="organization-panel"><p className="organization-alert" role="alert">{error}</p></section>;
  if (!risk) return null;

  return <section className="organization-panel">
    <div className="organization-panel-heading">
      <span><Activity size={18} /></span>
      <div>
        <h2>Delivery risk</h2>
        <p>{risk.score === null ? "Not enough inputs to score this project." : `${risk.score} of 100 · ${risk.band} · confidence ${risk.confidence}`}</p>
      </div>
    </div>

    <dl className="review-time-list">
      {risk.inputs.map((input) => <div key={input.key}>
        <dt>{INPUT_LABELS[input.key] ?? input.key}</dt>
        <dd>{input.available
          ? `${input.normalised} × ${input.effectiveWeight} = ${input.contribution}`
          : `Unavailable — ${REASON_LABELS[input.unavailableReason ?? ""] ?? input.unavailableReason}`}</dd>
      </div>)}
      <div>
        <dt>Target date</dt>
        <dd>{risk.target.date === null ? "None set" : `${risk.target.date} · ${risk.target.daysRemaining} days · from ${risk.target.source?.toLowerCase()}`}</dd>
      </div>
      <div>
        <dt>Forecast</dt>
        <dd>{risk.forecast === null
          ? "Not available — not enough completion history"
          : `${risk.forecast.expectedCompletionDays} days expected · earliest ${risk.forecast.earliestCompletionDays} · latest ${risk.forecast.latestCompletionDays ?? "unbounded"}`}</dd>
      </div>
    </dl>

    <p className="organization-muted">
      Weighted inputs sum to the score; contributions above are the arithmetic. Capacity is shared across
      projects, so pressure is an optimistic bound. Slip magnitude in days is not recorded and is never estimated.
    </p>

    <button className="structure-secondary" type="button" disabled={asking || risk.score === null} onClick={() => void askMichael()}>
      {asking ? <LoaderCircle size={15} /> : <Sparkles size={15} />}
      {asking ? "Asking Michael" : "Ask Michael about this score"}
    </button>
    {advice && <p className="organization-muted" role="status">{advice}</p>}
  </section>;
}

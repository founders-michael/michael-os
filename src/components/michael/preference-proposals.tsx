"use client";

/**
 * Phase 6: a change Michael proposes from how the user treats planned
 * sessions, with the evidence behind it and exactly what Apply would change.
 * Nothing changes until the user presses Apply; Not now silences it for a
 * while. Both wait for the server (CLAUDE.md §9.5): Apply saves availability.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { requestJson } from "@/components/michael/task-intelligence";
import { notify } from "@/lib/notifications";

type Proposal = {
  key: string; dayPart: "morning" | "evening";
  change: { field: "startTime" | "endTime"; value: string };
  evidence: { proposedInPart: number; deselectedInPart: number; proposedOutside: number; deselectedOutside: number };
  preview: string[];
};
type Availability = { timeZone: string; configured: boolean; windows: Array<{ id: string; weekday: number; startTime: string; endTime: string; timeZone: string; active: boolean }> };

function headline(proposal: Proposal) {
  return proposal.dayPart === "evening"
    ? `Stop planning sessions after ${proposal.change.value}?`
    : `Start planning sessions from ${proposal.change.value}?`;
}

function evidence(proposal: Proposal) {
  const { proposedInPart, deselectedInPart, proposedOutside, deselectedOutside } = proposal.evidence;
  return `You removed ${deselectedInPart} of ${proposedInPart} ${proposal.dayPart} sessions the planner suggested, but kept ${proposedOutside - deselectedOutside} of ${proposedOutside} at other times.`;
}

export default function PreferenceProposals({ onAvailabilityChanged }: { onAvailabilityChanged: (availability: Availability) => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const key = ["feedback", "proposals"];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await requestJson<{ proposals: Proposal[] }>("/api/feedback/proposals");
      // Suggestions are optional: if they can't load, show nothing rather than an error.
      return result.ok ? result.data.proposals : [];
    },
    staleTime: 60_000,
    retry: false,
  });
  const proposals = query.data ?? [];
  if (proposals.length === 0) return null;

  async function decide(proposal: Proposal, decision: "accept" | "dismiss") {
    setBusy(`${proposal.key}:${decision}`); setError("");
    const result = await requestJson<{ availability?: Availability }>("/api/feedback/proposals", { method: "POST", body: JSON.stringify({ key: proposal.key, decision }) });
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    if (decision === "accept" && result.data.availability) {
      onAvailabilityChanged(result.data.availability);
      notify.success("Availability updated", "The planner will use your new hours from now on.");
    }
    await queryClient.invalidateQueries({ queryKey: key });
  }

  return <section className="m-card m-proposals" aria-label="Michael's suggestions">
    {proposals.map((proposal) => <div key={proposal.key} className="m-proposal">
      <h2 className="m-proposal-title"><Sparkles size={15} aria-hidden="true" />{headline(proposal)}</h2>
      <p className="m-muted">{evidence(proposal)}</p>
      <p className="m-proposal-label">Apply would change your availability:</p>
      <ul className="m-proposal-preview">{proposal.preview.map((line) => <li key={line} className="m-mono">{line}</li>)}</ul>
      <div className="m-proposal-actions">
        <button type="button" className="m-btn m-btn-g" disabled={Boolean(busy)} onClick={() => void decide(proposal, "dismiss")}>{busy === `${proposal.key}:dismiss` && <LoaderCircle className="spin" size={14} aria-hidden="true" />}Not now</button>
        <button type="button" className="m-btn m-btn-p" disabled={Boolean(busy)} onClick={() => void decide(proposal, "accept")}>{busy === `${proposal.key}:accept` ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}Apply</button>
      </div>
    </div>)}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </section>;
}

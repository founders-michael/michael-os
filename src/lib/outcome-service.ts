import "server-only";

import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { recordOutcome, type OutcomeScope } from "@/lib/outcome-events";
import { getAvailability, replaceAvailability } from "@/lib/calendar-service";
import { proposePreferences, type PreferenceProposal } from "@/lib/intelligence-client";
import {
  availabilityAfter, changesAvailability, describeAvailabilityChange, PROPOSAL_LOOKBACK_DAYS, PROPOSAL_SUPPRESS_DAYS,
  type AvailabilityWindowInput,
} from "@/lib/preference-proposals";

/**
 * Phase 6 feedback (CLAUDE.md §10.8): what people did with what Michael
 * offered, as append-only `OutcomeEvent` rows, and the preference changes
 * Michael proposes from them.
 *
 * Server-side outcomes are written inside the transaction that caused them
 * (a confirmed suggestion, an applied plan), so an event exists exactly when
 * its outcome does. Only draft outcomes come from the client, because only
 * the chat knows a draft was discarded; they are limited to a fixed vocabulary
 * and to the caller's own scope. No event carries user content.
 *
 * A proposal is computed on demand (no table): the intelligence service applies
 * the published rules to counts read here, and nothing changes until the user
 * presses Apply.
 */
export class OutcomeError extends OrganizationApiError {}

/** A draft's fate as the chat reports it. The route has already checked kind and subject against the vocabulary. */
export async function recordClientOutcome(scope: OutcomeScope, kind: "DRAFT_SAVED" | "DRAFT_DISCARDED", subject: string) {
  await recordOutcome(prisma, scope, kind, subject);
  return { recorded: true };
}

// ---------------------------------------------------------------- proposals

const DAY_MS = 86_400_000;

export type ProposalView = PreferenceProposal & { preview: string[] };

/** The latest accept or dismiss per proposal key within the lookback: bounded by owner, kind and date (the [userId, kind, recordedAt] index). */
async function proposalDecisions(userId: string, lookbackStart: Date) {
  return prisma.outcomeEvent.groupBy({
    by: ["subject"],
    where: { userId, kind: { in: ["PROPOSAL_ACCEPTED", "PROPOSAL_DISMISSED"] }, recordedAt: { gte: lookbackStart } },
    _max: { recordedAt: true },
  });
}

/**
 * The changes Michael would propose to this user now, each with its evidence
 * and a preview of exactly what Apply would save. A proposal decided within
 * suppressDays is withheld; evidence older than its last decision is not
 * counted again (the counts are read once, so they start at the latest
 * decision on any proposal).
 */
export async function getPreferenceProposals(userId: string, now = new Date()): Promise<{ modelVersion: string; proposals: ProposalView[] }> {
  const lookbackStart = new Date(now.getTime() - PROPOSAL_LOOKBACK_DAYS * DAY_MS);
  const decisions = await proposalDecisions(userId, lookbackStart);
  const latestDecision = decisions.reduce<Date | null>((latest, row) => {
    const at = row._max.recordedAt;
    return at && (!latest || at > latest) ? at : latest;
  }, null);
  const since = latestDecision && latestDecision > lookbackStart ? latestDecision : lookbackStart;
  const sessions = await prisma.outcomeEvent.groupBy({
    by: ["localHour", "kind"],
    where: { userId, kind: { in: ["PLAN_SESSION_KEPT", "PLAN_SESSION_DESELECTED"] }, recordedAt: { gt: since } },
    _count: { _all: true },
  });
  const byHour = new Map<number, { hour: number; kept: number; deselected: number }>();
  for (const row of sessions) {
    if (row.localHour === null) continue;
    const entry = byHour.get(row.localHour) ?? { hour: row.localHour, kept: 0, deselected: 0 };
    if (row.kind === "PLAN_SESSION_KEPT") entry.kept += row._count._all; else entry.deselected += row._count._all;
    byHour.set(row.localHour, entry);
  }
  const suppressed = decisions
    .filter((row) => row._max.recordedAt && now.getTime() - row._max.recordedAt.getTime() < PROPOSAL_SUPPRESS_DAYS * DAY_MS)
    .map((row) => row.subject);
  if (byHour.size === 0) return { modelVersion: "", proposals: [] };
  const result = await proposePreferences({ sessionsByHour: [...byHour.values()].sort((a, b) => a.hour - b.hour), suppressed });
  const { windows } = await getAvailability(userId);
  const current = windows as AvailabilityWindowInput[];
  return {
    modelVersion: result.modelVersion,
    proposals: result.proposals
      .filter((proposal) => changesAvailability(current, proposal.change))
      .map((proposal) => ({ ...proposal, preview: describeAvailabilityChange(current, proposal.change) })),
  };
}

/**
 * The user pressed Apply. The proposal is recomputed rather than trusted from
 * the client, the availability is saved through the same service the Calendar
 * settings use, and only then is the acceptance recorded.
 */
export async function acceptPreferenceProposal(userId: string, key: string) {
  const { proposals } = await getPreferenceProposals(userId);
  const proposal = proposals.find((candidate) => candidate.key === key);
  if (!proposal) throw new OutcomeError(404, "PROPOSAL_NOT_AVAILABLE", "That suggestion no longer applies. Nothing was changed.");
  const { windows } = await getAvailability(userId);
  const next = availabilityAfter(windows as AvailabilityWindowInput[], proposal.change);
  const availability = await replaceAvailability(userId, { windows: next.map((window) => ({ ...window, active: window.active })) });
  await recordOutcome(prisma, { userId }, "PROPOSAL_ACCEPTED", key);
  return { accepted: true, availability };
}

export async function dismissPreferenceProposal(userId: string, key: string) {
  const { proposals } = await getPreferenceProposals(userId);
  if (!proposals.some((candidate) => candidate.key === key)) throw new OutcomeError(404, "PROPOSAL_NOT_AVAILABLE", "That suggestion is no longer shown.");
  await recordOutcome(prisma, { userId }, "PROPOSAL_DISMISSED", key);
  return { dismissed: true };
}

export function outcomeErrorResponse(error: unknown) {
  if (error instanceof OutcomeError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  return null;
}

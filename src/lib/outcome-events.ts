import "server-only";

import type { OutcomeKind, Prisma } from "@/generated/prisma/client";

/**
 * Writing Phase 6 outcome events (`OutcomeEvent`, append-only). Kept apart
 * from outcome-service.ts so the services that cause an outcome (planning,
 * classification) can record it inside their own transaction without
 * importing the proposal machinery.
 */
export type OutcomeScope = { userId: string } | { organizationId: string; actorUserId: string };

type Writer = Pick<Prisma.TransactionClient, "outcomeEvent">;

function ownerColumns(scope: OutcomeScope) {
  return "userId" in scope ? { userId: scope.userId } : { organizationId: scope.organizationId, actorUserId: scope.actorUserId };
}

/** One outcome, written by whichever client (a transaction or prisma) the caller is using. */
export function recordOutcome(db: Writer, scope: OutcomeScope, kind: Exclude<OutcomeKind, "PLAN_SESSION_KEPT" | "PLAN_SESSION_DESELECTED">, subject: string) {
  return db.outcomeEvent.create({ data: { ...ownerColumns(scope), kind, subject }, select: { id: true } });
}

/** The local hour a session starts at, on the user's clock. */
function localHour(iso: string, timeZone: string) {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return Number(hour) % 24;
}

/** Every proposed session of an applied plan, kept or removed: the planner's acceptance signal. */
export function recordPlanSessions(
  db: Writer, userId: string, timeZone: string,
  sessions: Array<{ selectionId: string; startAt: string; durationMinutes: number }>, selected: Set<string>,
) {
  return db.outcomeEvent.createMany({
    data: sessions.map((session) => ({
      userId,
      kind: selected.has(session.selectionId) ? "PLAN_SESSION_KEPT" as const : "PLAN_SESSION_DESELECTED" as const,
      subject: "task_session",
      localHour: localHour(session.startAt, timeZone),
      durationMinutes: Math.min(1440, Math.max(1, Math.round(session.durationMinutes))),
    })),
  });
}


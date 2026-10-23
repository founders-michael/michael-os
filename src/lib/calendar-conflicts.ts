import type { CalendarEventType } from "@/generated/prisma/client";

export type IntervalConflict = { eventId: string; eventType: CalendarEventType; title: string; startAt: string; endAt: string };

/** Half-open interval overlap: adjacent events (end = next start) are allowed. */
export function intervalsOverlap(a: { startAt: Date | string; endAt: Date | string }, b: { startAt: Date | string; endAt: Date | string }) {
  return new Date(a.startAt).getTime() < new Date(b.endAt).getTime() && new Date(a.endAt).getTime() > new Date(b.startAt).getTime();
}

export function detectIntervalConflicts<T extends { id: string; eventType: CalendarEventType; title: string; startAt: Date | string; endAt: Date | string }>(
  events: T[], requested: { startAt: Date | string; endAt: Date | string }, excludeId?: string,
): IntervalConflict[] {
  return events.filter((event) => event.id !== excludeId && intervalsOverlap(event, requested)).map((event) => ({
    eventId: event.id, eventType: event.eventType, title: event.title,
    startAt: new Date(event.startAt).toISOString(), endAt: new Date(event.endAt).toISOString(),
  }));
}

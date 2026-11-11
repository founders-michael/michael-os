import { summarizeDailyTasks, type DailyTaskEntry } from "@/lib/my-day-model";

export type TaskCompletionEvent = { taskId: string; status: string; changedAt: string };

/** One task may appear in the completion history more than once, but only once in its distinct-task summary. */
export function completionCyclesForRange(events: TaskCompletionEvent[], from: string, to: string) {
  return events.filter((event) => event.status === "COMPLETED" && Date.parse(event.changedAt) >= Date.parse(from) && Date.parse(event.changedAt) < Date.parse(to))
    .sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));
}

export function summarizePlannedReview(entries: DailyTaskEntry[]) {
  return summarizeDailyTasks(entries.filter((entry) => entry.statusAtSelectedDate !== null || entry.plannedSessions.length > 0 || entry.task.dueDate !== null));
}

export function unionDurationMinutes(intervals: Array<{ startAt: string | Date | number; endAt: string | Date | number }>) {
  const instant = (value: string | Date | number) => typeof value === "number" ? value : Date.parse(String(value));
  const sorted = intervals.map((item) => ({ start: instant(item.startAt), end: instant(item.endAt) }))
    .filter(({ start, end }) => Number.isFinite(start) && end > start).sort((a, b) => a.start - b.start);
  let total = 0; let start = 0; let end = 0;
  for (const item of sorted) {
    if (item.start > end) { total += Math.max(0, end - start); start = item.start; end = item.end; }
    else end = Math.max(end, item.end);
  }
  total += Math.max(0, end - start);
  return Math.round(total / 60_000);
}

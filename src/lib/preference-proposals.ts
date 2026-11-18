import feedback from "../../shared/intelligence/feedback.json";

/**
 * Phase 6 preference proposals, the part that runs in the browser and on the
 * server alike: what a proposal would change, shown before the user decides.
 * Which proposals exist is decided by the intelligence service
 * (`app/feedback/proposals.py`); this module only applies an accepted one to
 * the user's availability, deterministically, so the preview and the saved
 * result are the same computation.
 */

export const PROPOSALS_MODEL_VERSION = feedback.modelVersion;
export const CLIENT_OUTCOME_KINDS = feedback.clientOutcomes.kinds as readonly ("DRAFT_SAVED" | "DRAFT_DISCARDED")[];
export const LIFESTYLE_DRAFT_SUBJECTS = feedback.clientOutcomes.lifestyleSubjects;
export const WORK_DRAFT_SUBJECTS = feedback.clientOutcomes.workSubjects;
export const PROPOSAL_LOOKBACK_DAYS = feedback.proposals.lookbackDays;
export const PROPOSAL_SUPPRESS_DAYS = feedback.proposals.suppressDays;

export type DayPart = "morning" | "evening";
export type AvailabilityChange = { field: "startTime" | "endTime"; value: string };
export type AvailabilityWindowInput = { id?: string; weekday: number; startTime: string; endTime: string; timeZone?: string; active: boolean };

export function proposalKey(dayPart: DayPart) {
  return `avoid_day_part:${dayPart}`;
}

/**
 * The windows after the change: an evening proposal ends every window at the
 * cutoff, a morning one starts it there. A window wholly inside the avoided
 * part is removed; windows already clear of it are unchanged.
 */
export function availabilityAfter(windows: AvailabilityWindowInput[], change: AvailabilityChange): AvailabilityWindowInput[] {
  return windows.flatMap((window) => {
    if (!window.active) return [window];
    if (change.field === "endTime") {
      if (window.endTime <= change.value) return [window];
      if (window.startTime >= change.value) return [];
      return [{ ...window, endTime: change.value }];
    }
    if (window.startTime >= change.value) return [window];
    if (window.endTime <= change.value) return [];
    return [{ ...window, startTime: change.value }];
  });
}

/** Whether the change would alter anything: a proposal that changes nothing is not shown. */
export function changesAvailability(windows: AvailabilityWindowInput[], change: AvailabilityChange) {
  return JSON.stringify(availabilityAfter(windows, change)) !== JSON.stringify(windows);
}

const WEEKDAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One line per changed weekday, for the preview: "Mon: 09:00–21:00 → 09:00–17:00". */
export function describeAvailabilityChange(windows: AvailabilityWindowInput[], change: AvailabilityChange): string[] {
  const after = availabilityAfter(windows, change);
  const label = (list: AvailabilityWindowInput[], weekday: number) => list.filter((w) => w.active && w.weekday === weekday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime)).map((w) => `${w.startTime}–${w.endTime}`).join(", ") || "none";
  const lines: string[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const before = label(windows, weekday);
    const next = label(after, weekday);
    if (before !== next) lines.push(`${WEEKDAY[weekday]}: ${before} → ${next}`);
  }
  return lines;
}

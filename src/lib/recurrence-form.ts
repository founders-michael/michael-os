import { isoWeekday, type RecurrenceInput } from "@/lib/recurrence";
import type { TaskRecurrenceDto } from "@/lib/task-dto";

/** The task form's Repeat field state and its mapping to and from the API's rule. Pure, so it is tested. */
export type RepeatDraft = {
  preset: "none" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  weekdays: number[];
  monthDay: number;
  endsOn: string;
};

export const REPEAT_DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;

export function emptyRepeat(): RepeatDraft {
  return { preset: "none", frequency: "WEEKLY", interval: 1, weekdays: [], monthDay: 1, endsOn: "" };
}

/** The form's starting state for an existing task: its rule as the closest preset, or Custom. */
export function repeatFromTask(recurrence: TaskRecurrenceDto | null): RepeatDraft {
  if (!recurrence || !recurrence.active) return emptyRepeat();
  const base: RepeatDraft = { preset: "custom", frequency: recurrence.frequency, interval: recurrence.interval, weekdays: recurrence.weekdays, monthDay: recurrence.monthDay ?? 1, endsOn: recurrence.endsOn ?? "" };
  if (recurrence.endsOn || recurrence.interval !== 1) return base;
  if (recurrence.frequency === "DAILY") return { ...base, preset: "daily" };
  if (recurrence.frequency === "MONTHLY") return { ...base, preset: "monthly" };
  if (recurrence.weekdays.join() === "1,2,3,4,5") return { ...base, preset: "weekdays" };
  if (recurrence.weekdays.length === 1) return { ...base, preset: "weekly" };
  return base;
}

/**
 * The rule to send, or null for "doesn't repeat". Presets take their day from
 * the due date ("weekly" repeats on the due date's weekday), so they need one.
 */
export function repeatToRule(draft: RepeatDraft, dueDate: string): RecurrenceInput | null {
  const endsOn = draft.endsOn || null;
  switch (draft.preset) {
    case "none": return null;
    case "daily": return { frequency: "DAILY", interval: 1, weekdays: [], monthDay: null, endsOn: null };
    case "weekdays": return { frequency: "WEEKLY", interval: 1, weekdays: [1, 2, 3, 4, 5], monthDay: null, endsOn: null };
    case "weekly": return { frequency: "WEEKLY", interval: 1, weekdays: dueDate ? [isoWeekday(dueDate)] : [], monthDay: null, endsOn: null };
    case "monthly": return { frequency: "MONTHLY", interval: 1, weekdays: [], monthDay: dueDate ? Number(dueDate.slice(8, 10)) : 1, endsOn: null };
    default: return {
      frequency: draft.frequency, interval: Math.max(1, Math.min(99, Math.round(draft.interval) || 1)),
      weekdays: draft.frequency === "WEEKLY" ? [...draft.weekdays].sort((a, b) => a - b) : [],
      monthDay: draft.frequency === "MONTHLY" ? draft.monthDay : null, endsOn,
    };
  }
}


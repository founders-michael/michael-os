/**
 * The task form's "Remind me" fields: a local date and time on the owner's
 * clock, converted to and from the stored instant. Pure, so it is tested.
 */
export type ReminderDraft = { date: string; time: string };

/** The date and time an instant shows on a clock, as the form's inputs want them. */
export function reminderDraftFrom(remindAt: string | null, timeZone: string): ReminderDraft {
  if (!remindAt) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(remindAt));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/**
 * What to send: the reminder when both fields are filled and it differs from
 * the saved one, null to remove a saved one, nothing when unchanged. A half-
 * filled reminder is an error the form shows, never a guess.
 */
export function reminderChange(draft: ReminderDraft, saved: ReminderDraft): { reminder?: ReminderDraft | null } | { error: string } {
  const empty = !draft.date && !draft.time;
  if (empty) return saved.date ? { reminder: null } : {};
  if (!draft.date || !draft.time) return { error: "Choose both a date and a time for the reminder, or clear both." };
  if (draft.date === saved.date && draft.time === saved.time) return {};
  return { reminder: { date: draft.date, time: draft.time } };
}

/** "Remind 09:00 · 26 Nov" on the owner's clock. */
export function reminderLabel(remindAt: string, timeZone: string) {
  const at = new Date(remindAt);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(at);
  return `Remind ${time} · ${day}`;
}

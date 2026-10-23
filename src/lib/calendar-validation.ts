import { z } from "zod";

export const validTimeZone = (value: string) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
};

const isoInstant = z.string().datetime({ offset: true });
const timeZone = z.string().trim().min(1).max(100).refine(validTimeZone, "Enter a valid IANA timezone.");
const eventFields = {
  title: z.string().trim().min(1, "A title is required.").max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  eventType: z.enum(["TASK_SESSION", "COMMITMENT", "UNAVAILABLE"]),
  schedulingMode: z.enum(["FIXED", "FLEXIBLE"]),
  taskId: z.string().trim().min(1).nullable().optional(),
  startAt: isoInstant,
  endAt: isoInstant,
  timeZone,
};

function validEventSemantics(value: { eventType: string; schedulingMode: string; taskId?: string | null; startAt: string; endAt: string }, context: z.RefinementCtx) {
  if (Date.parse(value.startAt) >= Date.parse(value.endAt)) context.addIssue({ code: "custom", path: ["endAt"], message: "End time must be after start time." });
  if (value.eventType !== "TASK_SESSION" && value.taskId) context.addIssue({ code: "custom", path: ["taskId"], message: "Only task sessions can link to a task." });
  if (value.eventType !== "TASK_SESSION" && value.schedulingMode !== "FIXED") context.addIssue({ code: "custom", path: ["schedulingMode"], message: "Commitments and unavailable intervals must be fixed." });
}

export const calendarEventCreateSchema = z.object(eventFields).strict().superRefine(validEventSemantics);
export const calendarEventUpdateSchema = z.object({
  title: eventFields.title.optional(), description: eventFields.description,
  startAt: isoInstant.optional(), endAt: isoInstant.optional(), timeZone: timeZone.optional(),
  schedulingMode: eventFields.schedulingMode.optional(), taskId: eventFields.taskId,
}).strict().refine((data) => Object.keys(data).length > 0, "Change at least one event field.");
export const calendarRangeSchema = z.object({ from: isoInstant, to: isoInstant }).strict().refine((range) => {
  const duration = Date.parse(range.to) - Date.parse(range.from);
  return duration > 0 && duration <= 46 * 24 * 60 * 60 * 1000;
}, "Choose a date range no longer than 46 days.");

const availabilityWindow = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use local time in HH:mm format."),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use local time in HH:mm format."),
  active: z.boolean().default(true),
}).strict().refine((window) => window.startTime < window.endTime, { path: ["endTime"], message: "End time must be after start time. Overnight windows are not supported." });

export const availabilityUpdateSchema = z.object({ windows: z.array(availabilityWindow).max(50) }).strict().superRefine(({ windows }, context) => {
  const seen = new Map<number, Array<{ startTime: string; endTime: string; index: number }>>();
  windows.forEach((window, index) => {
    const day = seen.get(window.weekday) ?? [];
    if (day.some((other) => window.startTime < other.endTime && window.endTime > other.startTime)) context.addIssue({ code: "custom", path: ["windows", index, "startTime"], message: "Availability windows on the same weekday cannot overlap." });
    day.push({ startTime: window.startTime, endTime: window.endTime, index }); seen.set(window.weekday, day);
  });
});

export type CalendarEventCreateInput = z.infer<typeof calendarEventCreateSchema>;
export type CalendarEventUpdateInput = z.infer<typeof calendarEventUpdateSchema>;
export type AvailabilityUpdateInput = z.infer<typeof availabilityUpdateSchema>;

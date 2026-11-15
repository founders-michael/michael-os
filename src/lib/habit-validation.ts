import { z } from "zod";

const title = z.string().trim().min(1, "A habit name is required.").max(160);
const description = z.string().trim().max(2000).nullable();
const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a time in HH:mm format.").nullable();
const weekdays = z.array(z.number().int().min(1).max(7)).max(7).refine((days) => new Set(days).size === days.length, "Choose each weekday only once.").transform((days) => [...days].sort((a, b) => a - b));

export const habitCreateSchema = z.object({
  title,
  description: description.optional(),
  frequency: z.enum(["DAILY", "SELECTED_DAYS"]).default("DAILY"),
  weekdays: weekdays.default([]),
  startTime: localTime.optional(),
  endTime: localTime.optional(),
}).strict().superRefine((habit, context) => {
  checkHabitTimes(habit, context);
  if (habit.endTime && !habit.startTime && habit.startTime === undefined) context.addIssue({ code: "custom", path: ["startTime"], message: "Add a start time before an end time." });
  if (habit.frequency === "SELECTED_DAYS" && habit.weekdays.length === 0) {
    context.addIssue({ code: "custom", path: ["weekdays"], message: "Select at least one weekday." });
  }
  if (habit.frequency === "DAILY" && habit.weekdays.length > 0) {
    context.addIssue({ code: "custom", path: ["weekdays"], message: "Daily habits do not use selected weekdays." });
  }
});

export const habitUpdateSchema = z.object({
  title: title.optional(),
  description: description.optional(),
  frequency: z.enum(["DAILY", "SELECTED_DAYS"]).optional(),
  weekdays: weekdays.optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  startTime: localTime.optional(),
  endTime: localTime.optional(),
}).strict().superRefine((habit, context) => {
  if (Object.keys(habit).length === 0) context.addIssue({ code: "custom", message: "Change at least one habit field." });
  checkHabitTimes(habit, context);
});

/**
 * A habit may have a start time ("walk at 7:00") or a start and end ("sleep
 * 1:00 – 8:00"). An end earlier than the start runs past midnight.
 */
function checkHabitTimes(habit: { startTime?: string | null; endTime?: string | null }, context: z.RefinementCtx) {
  // On an update that sends only endTime, the stored start decides; the service checks that.
  const startGiven = habit.startTime !== undefined;
  if (habit.endTime && startGiven && !habit.startTime) context.addIssue({ code: "custom", path: ["startTime"], message: "Add a start time before an end time." });
  if (habit.endTime && habit.startTime && habit.endTime === habit.startTime) context.addIssue({ code: "custom", path: ["endTime"], message: "Choose an end time different from the start." });
}

export const habitListQuerySchema = z.object({ status: z.enum(["ACTIVE", "ARCHIVED"]).optional() }).strict();

export const checkInCreateSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a local date in YYYY-MM-DD format.").refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a real calendar date.").optional(),
}).strict();

export type HabitCreateInput = z.infer<typeof habitCreateSchema>;
export type HabitUpdateInput = z.infer<typeof habitUpdateSchema>;
export type HabitListQuery = z.infer<typeof habitListQuerySchema>;
export type CheckInCreateInput = z.infer<typeof checkInCreateSchema>;

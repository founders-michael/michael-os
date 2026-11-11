import { z } from "zod";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const dailyReviewDateSchema = localDate;
export const dailyReviewSaveSchema = z.object({
  date: localDate,
  wentWell: z.string().max(10_000),
  challenges: z.string().max(10_000),
  blockers: z.string().max(10_000),
  lessonsLearned: z.string().max(10_000),
  improvements: z.string().max(10_000),
  intentionallySkippedTaskIds: z.array(z.string().min(1).max(128)).max(100),
}).strict();
export const carryForwardReviewTaskSchema = z.object({
  reviewDate: localDate,
  taskId: z.string().min(1).max(128),
  targetDate: localDate.optional(),
  unschedule: z.boolean().optional(),
  startTime: localTime.optional(),
  endTime: localTime.optional(),
}).strict().superRefine((value, context) => {
  if (value.unschedule && value.targetDate) context.addIssue({ code: "custom", path: ["targetDate"], message: "Choose a date or keep the task unscheduled." });
  if (!value.unschedule && !value.targetDate) context.addIssue({ code: "custom", path: ["targetDate"], message: "Choose a date for this task." });
  if (value.targetDate && value.targetDate <= value.reviewDate) context.addIssue({ code: "custom", path: ["targetDate"], message: "Choose a date after the review date." });
  if (Boolean(value.startTime) !== Boolean(value.endTime)) context.addIssue({ code: "custom", path: ["endTime"], message: "Enter both a start and end time, or leave both blank." });
});

export type DailyReviewSaveInput = z.infer<typeof dailyReviewSaveSchema>;
export type CarryForwardReviewTaskInput = z.infer<typeof carryForwardReviewTaskSchema>;

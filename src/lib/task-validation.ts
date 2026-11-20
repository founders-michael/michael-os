import { z } from "zod";
import { recurrenceInputSchema } from "@/lib/recurrence";

/** "Remind me" as a person sets it: a local date and time on their own clock. The server converts it. */
const reminder = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31."),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30."),
}).strict();

const dueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a due date in YYYY-MM-DD format.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a real calendar date.");

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Add a task title.").max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  estimatedDurationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  remainingDurationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  dueDate: dueDate.nullable().optional(),
  /** Repeat this task on a schedule; its due date is the first occurrence. */
  recurrence: recurrenceInputSchema.nullable().optional(),
  reminder: reminder.nullable().optional(),
}).strict().refine((value) => !value.recurrence || Boolean(value.dueDate), { path: ["dueDate"], message: "Choose a due date for the first occurrence of a repeating task." });

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1, "Add a task title.").max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  estimatedDurationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  remainingDurationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  dueDate: dueDate.nullable().optional(),
  /** A rule sets or changes the repeat (from this occurrence on); null stops it, keeping every occurrence. */
  recurrence: recurrenceInputSchema.nullable().optional(),
  /** Sets a new reminder (sent once, at that time) or, with null, removes it. */
  reminder: reminder.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Change at least one task field.");

export const taskListQuerySchema = z.object({
  view: z.enum(["all", "pending", "completed", "overdue"]).default("all"),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  sort: z.enum(["recent", "dueDate", "priority"]).default("recent"),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict().superRefine((query, context) => {
  if (query.view === "pending" && query.status === "COMPLETED") {
    context.addIssue({ code: "custom", path: ["status"], message: "Pending tasks cannot have a completed status." });
  }
  if (query.view === "completed" && query.status && query.status !== "COMPLETED") {
    context.addIssue({ code: "custom", path: ["status"], message: "Completed view only includes completed tasks." });
  }
  if (query.view === "overdue" && query.status === "COMPLETED") {
    context.addIssue({ code: "custom", path: ["status"], message: "Completed tasks are not overdue." });
  }
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

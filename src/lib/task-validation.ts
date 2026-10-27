import { z } from "zod";

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
}).strict();

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1, "Add a task title.").max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  estimatedDurationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  remainingDurationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  dueDate: dueDate.nullable().optional(),
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

import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  try { return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
  catch { return false; }
}, "Use a valid date in YYYY-MM-DD format.");

const nullableId = z.string().trim().min(1).max(128).nullable().optional();
const description = z.string().trim().max(10_000).nullable().optional();
const estimate = z.number().int().min(1).max(10_080).nullable().optional();

export const workTaskListQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  projectId: nullableId,
  teamId: nullableId,
  assigneeId: nullableId,
  dueFrom: dateOnly.optional(),
  dueTo: dateOnly.optional(),
  archived: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  view: z.enum(["list", "board"]).default("list"),
  sort: z.enum(["dueDate", "priority", "updatedAt", "title"]).default("dueDate"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((value) => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo, {
  path: ["dueTo"], message: "The end date must be on or after the start date.",
});

export const workTaskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description,
  projectId: nullableId,
  teamId: nullableId,
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  startDate: dateOnly.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  estimatedMinutes: estimate,
}).strict().refine((value) => !value.startDate || !value.dueDate || value.dueDate >= value.startDate, {
  path: ["dueDate"], message: "The due date must be on or after the start date.",
});

export const workTaskUpdateSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description,
  projectId: nullableId,
  teamId: nullableId,
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  startDate: dateOnly.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  estimatedMinutes: estimate,
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"), "At least one field is required.").refine((value) => !value.startDate || !value.dueDate || value.dueDate >= value.startDate, {
  path: ["dueDate"], message: "The due date must be on or after the start date.",
});

export const workTaskAssignmentSchema = z.object({ userId: z.string().trim().min(1).max(128) }).strict();
export const workTaskDependencySchema = z.object({ dependsOnTaskId: z.string().trim().min(1).max(128) }).strict();
export const workTaskArchiveSchema = z.object({ archived: z.boolean() }).strict();
export const workTaskBulkUpdateSchema = z.object({
  taskIds: z.array(z.string().trim().min(1).max(128)).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Remove duplicate tasks."),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
}).strict().refine((value) => value.status !== undefined || value.priority !== undefined, "Choose a status or priority to update.");

export type WorkTaskListQuery = z.infer<typeof workTaskListQuerySchema>;
export type WorkTaskCreateInput = z.infer<typeof workTaskCreateSchema>;
export type WorkTaskUpdateInput = z.infer<typeof workTaskUpdateSchema>;

import { z } from "zod";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date in YYYY-MM-DD format.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a real calendar date.");

const title = z.string().trim().min(1, "A title is required.").max(160);
const description = z.string().trim().max(5000).nullable();

export const goalCreateSchema = z.object({
  title,
  description: description.optional(),
  category: z.string().trim().max(80).nullable().optional(),
  targetDate: calendarDate.nullable().optional(),
  progress: z.number().int().min(0).max(100).default(0),
}).strict();

export const goalUpdateSchema = z.object({
  title: title.optional(),
  description: description.optional(),
  category: z.string().trim().max(80).nullable().optional(),
  targetDate: calendarDate.nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Change at least one goal field.");

export const goalListQuerySchema = z.object({
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
  sort: z.enum(["recent", "targetDate"]).default("recent"),
}).strict();

export const milestoneCreateSchema = z.object({
  title,
  description: description.optional(),
}).strict();

export const milestoneUpdateSchema = z.object({
  title: title.optional(),
  description: description.optional(),
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
  position: z.number().int().min(0).max(10000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Change at least one milestone field.");

export type GoalCreateInput = z.infer<typeof goalCreateSchema>;
export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;
export type GoalListQuery = z.infer<typeof goalListQuerySchema>;
export type MilestoneCreateInput = z.infer<typeof milestoneCreateSchema>;
export type MilestoneUpdateInput = z.infer<typeof milestoneUpdateSchema>;

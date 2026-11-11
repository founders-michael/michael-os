import { z } from "zod";

const title = z.string().trim().min(1, "Add a milestone title.").max(160);
const description = z.string().trim().max(5000).nullable().optional();
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a real calendar date.");
const position = z.number().int().min(0).max(10_000);
const milestoneStatus = z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const projectMilestoneCreateSchema = z.object({
  title,
  description,
  status: milestoneStatus.default("PLANNED"),
  targetDate: calendarDate.nullable().optional(),
  position: position.optional(),
}).strict();

export const projectMilestoneUpdateSchema = z.object({
  title: title.optional(),
  description,
  status: milestoneStatus.optional(),
  targetDate: calendarDate.nullable().optional(),
  position: position.optional(),
  archived: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Send at least one field to update.");

export const projectMilestoneListQuerySchema = z.object({
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "ALL"]).default("ALL"),
  include: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type ProjectMilestoneCreateInput = z.infer<typeof projectMilestoneCreateSchema>;
export type ProjectMilestoneUpdateInput = z.infer<typeof projectMilestoneUpdateSchema>;
export type ProjectMilestoneListQuery = z.infer<typeof projectMilestoneListQuerySchema>;

import { z } from "zod";

const name = z.string().trim().min(2).max(160);
const teamName = z.string().trim().min(2).max(120);
const slug = z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens.");
const description = z.string().trim().max(4000).nullable().optional();
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  try { return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
  catch { return false; }
}, "Use a real calendar date in YYYY-MM-DD format.");

export const structureListQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const teamCreateSchema = z.object({ name: teamName, slug: slug.optional(), description }).strict();
export const teamUpdateSchema = z.object({ name: teamName.optional(), slug: slug.optional(), description }).strict().refine((value) => Object.keys(value).length > 0);
export const teamLeadSchema = z.object({ userId: z.string().min(1).max(128).nullable() }).strict();
export const structureMemberSchema = z.object({ userId: z.string().min(1).max(128) }).strict();

export const projectCreateSchema = z.object({
  name,
  slug: slug.optional(),
  description,
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  startDate: calendarDate.nullable().optional(),
  targetEndDate: calendarDate.nullable().optional(),
}).strict().refine((value) => !value.startDate || !value.targetEndDate || value.targetEndDate >= value.startDate, { path: ["targetEndDate"], message: "Target date must be on or after the start date." });

export const projectUpdateSchema = z.object({
  name: name.optional(),
  slug: slug.optional(),
  description,
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  startDate: calendarDate.nullable().optional(),
  targetEndDate: calendarDate.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0).refine((value) => !value.startDate || !value.targetEndDate || value.targetEndDate >= value.startDate, { path: ["targetEndDate"], message: "Target date must be on or after the start date." });

export const projectOwnerSchema = z.object({ userId: z.string().min(1).max(128).nullable() }).strict();
export const projectMemberSchema = z.object({ userId: z.string().min(1).max(128), role: z.enum(["MEMBER", "CONTRIBUTOR", "VIEWER"]).default("MEMBER") }).strict();

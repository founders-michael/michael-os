import { z } from "zod";

const recordId = z.string().trim().min(1).max(128);
const page = z.coerce.number().int().min(1).max(10_000).default(1);
const limit = z.coerce.number().int().min(1).max(50).default(20);

/** The most goals one task may be linked to; also the signal's bound. */
export const MAX_GOAL_LINKS = 5;

export const personalPrioritiesQuerySchema = z.object({ page, limit }).strict();

export const workPrioritiesQuerySchema = z.object({
  page,
  limit,
  /** "mine": tasks assigned to the viewer (the default); "visible": every task the viewer may see. */
  scope: z.enum(["mine", "visible"]).default("mine"),
  projectId: recordId.optional(),
}).strict();

export const taskGoalLinksSchema = z.object({
  goalIds: z.array(recordId).max(MAX_GOAL_LINKS, `Link a task to at most ${MAX_GOAL_LINKS} goals.`)
    .refine((ids) => new Set(ids).size === ids.length, "Each goal can be linked once."),
}).strict();

/** Only tasks are classified by Michael in Phase 4; the user asks per record. */
export const personalCategorySuggestSchema = z.object({
  entityType: z.literal("TASK"),
  entityId: recordId,
  dataUseAcknowledged: z.boolean().default(false),
}).strict();

export const workCategorySuggestSchema = z.object({
  entityType: z.literal("WORK_TASK"),
  entityId: recordId,
  dataUseAcknowledged: z.boolean().default(false),
}).strict();

export type PersonalPrioritiesQuery = z.infer<typeof personalPrioritiesQuerySchema>;
export type WorkPrioritiesQuery = z.infer<typeof workPrioritiesQuerySchema>;

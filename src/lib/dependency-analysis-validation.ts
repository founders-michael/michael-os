import { z } from "zod";

export const dependencyAnalysisListQuerySchema = z.object({
  projectId: z.string().trim().min(1).max(128).optional(),
  /** Only tasks that are dependency-blocked right now. */
  blockedOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
}).strict();

export type DependencyAnalysisListQuery = z.infer<typeof dependencyAnalysisListQuerySchema>;

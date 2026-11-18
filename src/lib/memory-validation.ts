import { z } from "zod";
import selection from "../../shared/intelligence/memory-selection.json";

/** One memory is a short note, not a document: the engine's own bound. */
export const MEMORY_TEXT_MAX = selection.limits.maxTextChars;
/** The most current memories one user, or one organization, may keep. */
export const MAX_MEMORIES_PER_OWNER = 100;
/** How many memories Michael reads for one question. */
export const MEMORY_CONTEXT_LIMIT = selection.limits.defaultLimit;
export const MEMORY_QUERY_MAX = selection.limits.maxQueryChars;

export const MEMORY_SENSITIVITIES = ["STANDARD", "PERSONAL", "SENSITIVE"] as const;
export type MemorySensitivity = (typeof MEMORY_SENSITIVITIES)[number];

/** What each level means to the person choosing it, and to which provider it may go. */
export const MEMORY_SENSITIVITY_LABELS: Record<MemorySensitivity, { label: string; detail: string }> = {
  STANDARD: { label: "Everyday", detail: "Michael can use it with any AI provider." },
  PERSONAL: { label: "Personal", detail: "Used only with a paid or local AI provider." },
  SENSITIVE: { label: "Private", detail: "Kept here for you; never sent to Michael's AI provider." },
};

/**
 * Which levels the active provider may receive (CLAUDE.md §10.8–10.9): never
 * SENSITIVE; PERSONAL only on a paid-tier or local provider, since an unpaid
 * tier may use what it is sent.
 */
export function sensitivitiesForProvider(dataTier: "paid" | "unpaid"): MemorySensitivity[] {
  return dataTier === "paid" ? ["STANDARD", "PERSONAL"] : ["STANDARD"];
}

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31.")
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Use a real calendar date.");

/**
 * The fields of one memory version. An edit sends all of them: it saves a new
 * version beside the old one rather than changing it (history), so a partial
 * body would leave the new version's other fields to guesswork.
 */
export const memoryInputSchema = z.object({
  content: z.string().trim().min(1, "Write the memory first.").max(MEMORY_TEXT_MAX, `Keep a memory to ${MEMORY_TEXT_MAX} characters.`),
  sensitivity: z.enum(MEMORY_SENSITIVITIES).default("STANDARD"),
  /** Last local day the memory applies; omitted or null keeps it until deleted. */
  keepUntil: localDate.nullable().optional(),
}).strict();
export type MemoryInput = z.infer<typeof memoryInputSchema>;

export const memoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_MEMORIES_PER_OWNER).default(50),
}).strict();
export type MemoryListQuery = z.infer<typeof memoryListQuerySchema>;

export const memoryIdSchema = z.string().trim().min(1).max(128);

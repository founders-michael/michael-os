import { z } from "zod";
import { CLIENT_OUTCOME_KINDS, LIFESTYLE_DRAFT_SUBJECTS, WORK_DRAFT_SUBJECTS } from "@/lib/preference-proposals";

/**
 * What a client may report: only a draft's fate, which only the chat sees.
 * Every other outcome is recorded by the server where it happens, so a client
 * can never claim a suggestion was confirmed or a plan applied.
 */
const kind = z.enum(CLIENT_OUTCOME_KINDS as unknown as ["DRAFT_SAVED", "DRAFT_DISCARDED"]);
export const lifestyleOutcomeSchema = z.object({ kind, subject: z.enum(LIFESTYLE_DRAFT_SUBJECTS as [string, ...string[]]) }).strict();
export const workOutcomeSchema = z.object({ kind, subject: z.enum(WORK_DRAFT_SUBJECTS as [string, ...string[]]) }).strict();

export const proposalDecisionSchema = z.object({
  key: z.enum(["avoid_day_part:morning", "avoid_day_part:evening"]),
  decision: z.enum(["accept", "dismiss"]),
}).strict();

import { z } from "zod";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  try {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  } catch { return false; }
}, "Use a real calendar date in YYYY-MM-DD format.");

export const planningProposalRequestSchema = z.object({ fromDate: localDate, toDate: localDate }).strict();
export const applyPlanningProposalSchema = z.object({
  approvalToken: z.string().min(20).max(100_000),
  selectedSessionIds: z.array(z.string().uuid()).min(1).max(500),
}).strict();

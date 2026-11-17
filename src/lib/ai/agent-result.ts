import type { AIToolActivity } from "@/lib/ai/types";

/** What one chat turn produces, whichever engine ran it. */
export type AgentResult = {
  message: string;
  toolActivity: AIToolActivity[];
  clientPayloads: unknown[];
  usage?: { inputTokens?: number; outputTokens?: number };
};

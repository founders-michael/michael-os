import type { ZodType } from "zod";
import type { AIAgentContext, AIToolDeclaration } from "@/lib/ai/types";

export type AIToolDefinition = {
  declaration: AIToolDeclaration;
  schema: ZodType;
  execute: (context: AIAgentContext, input: unknown) => Promise<unknown>;
};


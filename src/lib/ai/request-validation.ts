import { z } from "zod";

export const aiChatRequestSchema = z.object({
  product: z.enum(["lifestyle", "work"]),
  organizationId: z.string().min(1).max(128).optional(),
  /** When present, history is loaded server-side and the client's is ignored. */
  conversationId: z.string().trim().min(1).max(128).optional(),
  message: z.string().trim().min(1).max(4_000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2_000) }).strict()).max(10).default([]),
  dataUseAcknowledged: z.boolean().default(false),
}).strict().superRefine((request, context) => {
  if (request.product === "lifestyle" && request.organizationId) context.addIssue({ code: "custom", path: ["organizationId"], message: "LifestyleOS requests cannot include organization context." });
  if (request.product === "work" && !request.organizationId) context.addIssue({ code: "custom", path: ["organizationId"], message: "WorkOS requests require an organization context." });
});

export type AIChatRequest = z.infer<typeof aiChatRequestSchema>;


import { z } from "zod";

export const conversationProductSchema = z.enum(["lifestyle", "work"]);

export const conversationCreateSchema = z.object({
  product: conversationProductSchema,
  organizationId: z.string().trim().min(1).max(128).optional(),
  /** Optional opening message; the title is derived from it when present. */
  title: z.string().trim().min(1).max(120).optional(),
}).strict().superRefine((value, context) => {
  if (value.product === "work" && !value.organizationId) {
    context.addIssue({ code: "custom", path: ["organizationId"], message: "WorkOS conversations require an organization." });
  }
  if (value.product === "lifestyle" && value.organizationId) {
    context.addIssue({ code: "custom", path: ["organizationId"], message: "LifestyleOS conversations cannot carry organization context." });
  }
});

export const conversationListQuerySchema = z.object({
  product: conversationProductSchema.optional(),
  organizationId: z.string().trim().min(1).max(128).optional(),
  include: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const conversationMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const conversationUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  archived: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Send at least one field to update.");

export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type ConversationMessagesQuery = z.infer<typeof conversationMessagesQuerySchema>;
export type ConversationUpdateInput = z.infer<typeof conversationUpdateSchema>;

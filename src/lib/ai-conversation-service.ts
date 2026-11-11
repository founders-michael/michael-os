import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission } from "@/lib/organization-authorization";
import { hasProductPermission } from "@/lib/product-authorization";
import {
  CONVERSATION_CONTEXT_TURNS,
  deriveConversationTitle,
  historyForContext,
} from "@/lib/ai-conversation-model";
import type {
  ConversationCreateInput,
  ConversationListQuery,
  ConversationMessagesQuery,
  ConversationUpdateInput,
} from "@/lib/ai-conversation-validation";

export class ConversationError extends Error {
  constructor(public readonly status: 403 | 404 | 409, public readonly code: string, message: string) {
    super(message);
    this.name = "ConversationError";
  }
}

const serializable = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

/** One user may not accumulate conversations without limit. */
const MAX_CONVERSATIONS_PER_USER = 200;

const conversationSelect = {
  id: true, product: true, organizationId: true, title: true,
  messageCount: true, lastMessageAt: true, archivedAt: true, createdAt: true, updatedAt: true,
} as const;

type ConversationRow = Prisma.AiConversationGetPayload<{ select: typeof conversationSelect }>;

export type ConversationDto = {
  id: string;
  product: "lifestyle" | "work";
  organizationId: string | null;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

function toDto(row: ConversationRow): ConversationDto {
  return {
    id: row.id,
    product: row.product === "WORK" ? "work" : "lifestyle",
    organizationId: row.organizationId,
    title: row.title,
    messageCount: row.messageCount,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function isSerializationConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("40001") || message.includes("could not serialize access") || message.includes("TransactionWriteConflict");
}

async function runSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, serializable);
    } catch (error) {
      if (error instanceof ConversationError) throw error;
      if (isSerializationConflict(error) && attempt < 2) continue;
      throw error;
    }
  }
  throw new ConversationError(409, "CONVERSATION_BUSY", "That conversation is being updated. Please retry.");
}

/**
 * Both product entitlement and, for WORK, current organization membership.
 * A conversation quotes organization data, so losing membership must also lose
 * access to the transcript, not merely to new answers.
 */
async function authorizeProductContext(userId: string, product: "lifestyle" | "work", organizationId: string | null) {
  if (product === "lifestyle") {
    if (!(await hasProductPermission(userId, "LIFESTYLE_OS_ACCESS"))) {
      throw new ConversationError(403, "PRODUCT_ACCESS_REQUIRED", "You do not have access to this product.");
    }
    return;
  }
  if (!organizationId) throw new ConversationError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  // Asserts WORK_OS_ACCESS before membership, then membership itself.
  await requireOrganizationPermission(organizationId, "organization.read");
}

/** The caller's own conversation, with its context re-authorized on every read. */
async function ownedConversation(userId: string, conversationId: string) {
  const row = await prisma.aiConversation.findFirst({
    where: { id: conversationId, userId },
    select: conversationSelect,
  });
  if (!row) throw new ConversationError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  await authorizeProductContext(userId, row.product === "WORK" ? "work" : "lifestyle", row.organizationId);
  return row;
}

export async function createConversation(userId: string, input: ConversationCreateInput) {
  await authorizeProductContext(userId, input.product, input.organizationId ?? null);

  return runSerializable(async (tx) => {
    const existing = await tx.aiConversation.count({ where: { userId, archivedAt: null } });
    if (existing >= MAX_CONVERSATIONS_PER_USER) {
      throw new ConversationError(409, "CONVERSATION_LIMIT_REACHED", `Archive an older conversation first; the limit is ${MAX_CONVERSATIONS_PER_USER}.`);
    }
    const row = await tx.aiConversation.create({
      data: {
        userId,
        product: input.product === "work" ? "WORK" : "LIFESTYLE",
        organizationId: input.product === "work" ? input.organizationId! : null,
        title: input.title ? deriveConversationTitle(input.title) : "New conversation",
      },
      select: conversationSelect,
    });
    return toDto(row);
  });
}

export async function listConversations(userId: string, query: ConversationListQuery) {
  // Only contexts the caller still has access to are listed.
  const products: Array<"lifestyle" | "work"> = query.product ? [query.product] : ["lifestyle", "work"];
  const allowed: Array<"LIFESTYLE" | "WORK"> = [];
  for (const product of products) {
    if (product === "lifestyle") {
      if (await hasProductPermission(userId, "LIFESTYLE_OS_ACCESS")) allowed.push("LIFESTYLE");
    } else if (await hasProductPermission(userId, "WORK_OS_ACCESS")) allowed.push("WORK");
  }
  if (allowed.length === 0) return { conversations: [], page: query.page, limit: query.limit, total: 0, pages: 1 };

  const where: Prisma.AiConversationWhereInput = {
    userId,
    product: { in: allowed },
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.include === "ALL" ? {} : query.include === "ARCHIVED" ? { archivedAt: { not: null } } : { archivedAt: null }),
  };
  const [rows, total] = await Promise.all([
    prisma.aiConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: conversationSelect,
    }),
    prisma.aiConversation.count({ where }),
  ]);

  // A WORK conversation whose membership has lapsed is withheld, not listed.
  const visible: ConversationDto[] = [];
  for (const row of rows) {
    if (row.product === "WORK" && row.organizationId) {
      try {
        await requireOrganizationPermission(row.organizationId, "organization.read");
      } catch {
        continue;
      }
    }
    visible.push(toDto(row));
  }

  return {
    conversations: visible,
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getConversationMessages(userId: string, conversationId: string, query: ConversationMessagesQuery) {
  const conversation = await ownedConversation(userId, conversationId);
  const where = { conversationId: conversation.id, userId };
  const [rows, total] = await Promise.all([
    prisma.aiConversationMessage.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: { id: true, role: true, content: true, toolActivity: true, createdAt: true },
    }),
    prisma.aiConversationMessage.count({ where }),
  ]);
  return {
    conversation: toDto(conversation),
    messages: rows.map((row) => ({
      id: row.id,
      role: row.role === "USER" ? "user" as const : "assistant" as const,
      content: row.content,
      toolActivity: row.toolActivity,
      createdAt: row.createdAt.toISOString(),
    })),
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function updateConversation(userId: string, conversationId: string, input: ConversationUpdateInput) {
  await ownedConversation(userId, conversationId);
  return runSerializable(async (tx) => {
    const current = await tx.aiConversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
    if (!current) throw new ConversationError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    const row = await tx.aiConversation.update({
      where: { id: current.id },
      data: {
        ...(input.title !== undefined ? { title: deriveConversationTitle(input.title) } : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      },
      select: conversationSelect,
    });
    return toDto(row);
  });
}

export async function deleteConversation(userId: string, conversationId: string) {
  await ownedConversation(userId, conversationId);
  return runSerializable(async (tx) => {
    const current = await tx.aiConversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
    if (!current) throw new ConversationError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    // Messages cascade with the conversation.
    await tx.aiConversation.delete({ where: { id: current.id } });
    return { deleted: true as const };
  });
}

/**
 * Server-side history for the chat route. Replaces the client-supplied history
 * when a conversation is named, so a transcript cannot be forged by the caller.
 */
export async function loadConversationForChat(
  userId: string,
  conversationId: string,
  product: "lifestyle" | "work",
  organizationId: string | undefined,
  maxChars: number,
) {
  const conversation = await ownedConversation(userId, conversationId);
  const conversationProduct = conversation.product === "WORK" ? "work" : "lifestyle";
  // A lifestyle conversation must never be continued in work context, nor a
  // work conversation under a different organization.
  if (conversationProduct !== product) {
    throw new ConversationError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  }
  if (conversationProduct === "work" && conversation.organizationId !== (organizationId ?? null)) {
    throw new ConversationError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  }

  const turns = await prisma.aiConversationMessage.findMany({
    where: { conversationId: conversation.id, userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CONVERSATION_CONTEXT_TURNS,
    select: { role: true, content: true },
  });
  return {
    conversation,
    history: historyForContext([...turns].reverse(), maxChars),
  };
}

/**
 * Appends one completed exchange. Written only after the model answered, so a
 * failed turn leaves no dangling user message, and append-only: a stored
 * message is never rewritten.
 */
export async function appendExchange(
  userId: string,
  conversationId: string,
  exchange: {
    userMessage: string;
    assistantMessage: string;
    toolActivity: unknown;
    usage?: { inputTokens?: number; outputTokens?: number };
  },
) {
  return runSerializable(async (tx) => {
    const current = await tx.aiConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, messageCount: true, title: true },
    });
    if (!current) throw new ConversationError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    const now = new Date();
    await tx.aiConversationMessage.createMany({
      data: [
        { conversationId: current.id, userId, role: "USER", content: exchange.userMessage, createdAt: now },
        {
          conversationId: current.id, userId, role: "ASSISTANT", content: exchange.assistantMessage,
          toolActivity: (exchange.toolActivity ?? []) as Prisma.InputJsonValue,
          inputTokens: exchange.usage?.inputTokens ?? null,
          outputTokens: exchange.usage?.outputTokens ?? null,
          createdAt: new Date(now.getTime() + 1),
        },
      ],
    });
    await tx.aiConversation.update({
      where: { id: current.id },
      data: {
        messageCount: current.messageCount + 2,
        lastMessageAt: now,
        // The first exchange names an untitled conversation.
        ...(current.messageCount === 0 ? { title: deriveConversationTitle(exchange.userMessage) } : {}),
      },
    });
    return { appended: true as const };
  });
}

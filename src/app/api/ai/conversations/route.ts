import { auth } from "@/lib/auth";
import { createConversation, listConversations, ConversationError } from "@/lib/ai-conversation-service";
import { conversationCreateSchema, conversationListQuerySchema } from "@/lib/ai-conversation-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

async function sessionUserId(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}

function failure(error: unknown, fallback: string) {
  if (error instanceof ConversationError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (typeof error === "object" && error !== null && "status" in error && "code" in error) {
    const api = error as { status: number; code: string; message: string };
    return Response.json({ error: api.message, code: api.code }, { status: api.status });
  }
  console.error("[ai-conversations] Request failed.");
  return Response.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  const userId = await sessionUserId(request);
  if (!userId) return Response.json({ error: "Sign in to view your conversations." }, { status: 401 });
  const query = conversationListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.success) {
    return Response.json({ error: "Check the conversation filters and try again.", code: "INVALID_REQUEST", fields: query.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    return privateJson(await listConversations(userId, query.data));
  } catch (error) {
    return failure(error, "We couldn't load your conversations. Please try again.");
  }
}

export async function POST(request: Request) {
  const userId = await sessionUserId(request);
  if (!userId) return Response.json({ error: "Sign in to start a conversation." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send conversation details as valid JSON." }, { status: 400 }); }
  const parsed = conversationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check the conversation details and try again.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    return privateJson({ conversation: await createConversation(userId, parsed.data) }, { status: 201 });
  } catch (error) {
    return failure(error, "We couldn't start that conversation. Please try again.");
  }
}

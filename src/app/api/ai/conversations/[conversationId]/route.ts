import { auth } from "@/lib/auth";
import { deleteConversation, updateConversation, ConversationError } from "@/lib/ai-conversation-service";
import { conversationUpdateSchema } from "@/lib/ai-conversation-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

type Context = { params: Promise<{ conversationId: string }> };

async function sessionUserId(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user.id ?? null;
  } catch { return null; }
}

function failure(error: unknown, fallback: string) {
  if (error instanceof ConversationError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  if (typeof error === "object" && error !== null && "status" in error && "code" in error) {
    const api = error as { status: number; code: string; message: string };
    return Response.json({ error: api.message, code: api.code }, { status: api.status });
  }
  console.error("[ai-conversations] Request failed.");
  return Response.json({ error: fallback }, { status: 500 });
}

export async function PATCH(request: Request, context: Context) {
  const userId = await sessionUserId(request);
  if (!userId) return Response.json({ error: "Sign in to update a conversation." }, { status: 401 });
  const { conversationId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send conversation details as valid JSON." }, { status: 400 }); }
  const parsed = conversationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check the conversation details and try again.", code: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    return privateJson({ conversation: await updateConversation(userId, conversationId, parsed.data) });
  } catch (error) {
    return failure(error, "We couldn't update that conversation. Please try again.");
  }
}

export async function DELETE(request: Request, context: Context) {
  const userId = await sessionUserId(request);
  if (!userId) return Response.json({ error: "Sign in to remove a conversation." }, { status: 401 });
  const { conversationId } = await context.params;
  try {
    return privateJson(await deleteConversation(userId, conversationId));
  } catch (error) {
    return failure(error, "We couldn't remove that conversation. Please try again.");
  }
}

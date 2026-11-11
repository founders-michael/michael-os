import { auth } from "@/lib/auth";
import { getConversationMessages, ConversationError } from "@/lib/ai-conversation-service";
import { conversationMessagesQuerySchema } from "@/lib/ai-conversation-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: Context) {
  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    userId = session?.user.id ?? null;
  } catch { userId = null; }
  if (!userId) return Response.json({ error: "Sign in to view this conversation." }, { status: 401 });

  const { conversationId } = await context.params;
  const query = conversationMessagesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.success) {
    return Response.json({ error: "Check the message filters and try again.", code: "INVALID_REQUEST", fields: query.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    return privateJson(await getConversationMessages(userId, conversationId, query.data));
  } catch (error) {
    if (error instanceof ConversationError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    if (typeof error === "object" && error !== null && "status" in error && "code" in error) {
      const api = error as { status: number; code: string; message: string };
      return Response.json({ error: api.message, code: api.code }, { status: api.status });
    }
    console.error("[ai-conversations] Could not load messages.");
    return Response.json({ error: "We couldn't load that conversation. Please try again." }, { status: 500 });
  }
}

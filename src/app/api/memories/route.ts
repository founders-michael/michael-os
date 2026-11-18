import { createMemory, listMemories, memoryErrorResponse } from "@/lib/memory-service";
import { invalidMemoryRequest, personalMemoryOwner, readJson } from "@/lib/memory-http";
import { memoryInputSchema, memoryListQuerySchema } from "@/lib/memory-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

/** What Michael may remember about the signed-in user: their own saved memories, newest first. */
export async function GET(request: Request) {
  const resolved = await personalMemoryOwner();
  if ("response" in resolved) return resolved.response;
  const parsed = memoryListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalidMemoryRequest(parsed.error.flatten().fieldErrors);
  try {
    return privateJson(await listMemories(resolved.owner, parsed.data));
  } catch (error) {
    return memoryErrorResponse(error) ?? failed("load");
  }
}

/** Saves one memory. Settings and the Save button on a Michael draft both post here, as the user. */
export async function POST(request: Request) {
  const resolved = await personalMemoryOwner();
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request);
  if (!body.ok) return invalidMemoryRequest();
  const parsed = memoryInputSchema.safeParse(body.body);
  if (!parsed.success) return invalidMemoryRequest(parsed.error.flatten().fieldErrors);
  try {
    return privateJson({ memory: await createMemory(resolved.owner, parsed.data) }, { status: 201 });
  } catch (error) {
    return memoryErrorResponse(error) ?? failed("save");
  }
}

function failed(action: "load" | "save") {
  console.error(`[memories] Could not ${action} memories for the authenticated user.`);
  return Response.json({ error: `We couldn't ${action} your memories. Please try again.` }, { status: 500 });
}

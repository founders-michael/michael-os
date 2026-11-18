import { deleteMemory, memoryErrorResponse, updateMemory } from "@/lib/memory-service";
import { invalidMemoryRequest, personalMemoryOwner, readJson } from "@/lib/memory-http";
import { memoryIdSchema, memoryInputSchema } from "@/lib/memory-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ memoryId: string }> };

/** Edits a memory by saving a new version; the earlier one stays as history until the memory is deleted. */
export async function PUT(request: Request, context: Context) {
  const resolved = await personalMemoryOwner();
  if ("response" in resolved) return resolved.response;
  const id = memoryIdSchema.safeParse((await context.params).memoryId);
  if (!id.success) return invalidMemoryRequest();
  const body = await readJson(request);
  if (!body.ok) return invalidMemoryRequest();
  const parsed = memoryInputSchema.safeParse(body.body);
  if (!parsed.success) return invalidMemoryRequest(parsed.error.flatten().fieldErrors);
  try {
    return privateJson({ memory: await updateMemory(resolved.owner, id.data, parsed.data) });
  } catch (error) {
    return memoryErrorResponse(error) ?? failed("update");
  }
}

/** Forgets a memory: every version of it. */
export async function DELETE(_request: Request, context: Context) {
  const resolved = await personalMemoryOwner();
  if ("response" in resolved) return resolved.response;
  const id = memoryIdSchema.safeParse((await context.params).memoryId);
  if (!id.success) return invalidMemoryRequest();
  try {
    return privateJson(await deleteMemory(resolved.owner, id.data));
  } catch (error) {
    return memoryErrorResponse(error) ?? failed("delete");
  }
}

function failed(action: "update" | "delete") {
  console.error(`[memories] Could not ${action} a memory for the authenticated user.`);
  return Response.json({ error: `We couldn't ${action} that memory. Please try again.` }, { status: 500 });
}

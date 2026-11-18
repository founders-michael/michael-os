import { organizationErrorResponse } from "@/lib/organization-authorization";
import { deleteMemory, memoryErrorResponse, updateMemory } from "@/lib/memory-service";
import { invalidMemoryRequest, organizationMemoryOwner, readJson } from "@/lib/memory-http";
import { memoryIdSchema, memoryInputSchema } from "@/lib/memory-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string; memoryId: string }> };

/** Edits an organization memory by saving a new version. Owners and admins only. */
export async function PUT(request: Request, context: Context) {
  try {
    const { organizationId, memoryId } = await context.params;
    const owner = await organizationMemoryOwner(organizationId, "manage");
    const id = memoryIdSchema.safeParse(memoryId);
    if (!id.success) return invalidMemoryRequest();
    const body = await readJson(request);
    if (!body.ok) return invalidMemoryRequest();
    const parsed = memoryInputSchema.safeParse(body.body);
    if (!parsed.success) return invalidMemoryRequest(parsed.error.flatten().fieldErrors);
    return privateJson({ memory: await updateMemory(owner, id.data, parsed.data) });
  } catch (error) {
    return memoryErrorResponse(error) ?? organizationErrorResponse(error);
  }
}

/** Forgets an organization memory, every version of it. Owners and admins only. */
export async function DELETE(_request: Request, context: Context) {
  try {
    const { organizationId, memoryId } = await context.params;
    const owner = await organizationMemoryOwner(organizationId, "manage");
    const id = memoryIdSchema.safeParse(memoryId);
    if (!id.success) return invalidMemoryRequest();
    return privateJson(await deleteMemory(owner, id.data));
  } catch (error) {
    return memoryErrorResponse(error) ?? organizationErrorResponse(error);
  }
}

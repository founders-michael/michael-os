import { organizationErrorResponse } from "@/lib/organization-authorization";
import { createMemory, listMemories, memoryErrorResponse } from "@/lib/memory-service";
import { invalidMemoryRequest, organizationMemoryOwner, readJson } from "@/lib/memory-http";
import { memoryInputSchema, memoryListQuerySchema } from "@/lib/memory-validation";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;
type Context = { params: Promise<{ organizationId: string }> };

/** The organization's shared memories. Any member may read them. */
export async function GET(request: Request, context: Context) {
  try {
    const owner = await organizationMemoryOwner((await context.params).organizationId, "read");
    const parsed = memoryListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return invalidMemoryRequest(parsed.error.flatten().fieldErrors);
    return privateJson(await listMemories(owner, parsed.data));
  } catch (error) {
    return memoryErrorResponse(error) ?? organizationErrorResponse(error);
  }
}

/** Saves one organization memory. Owners and admins only; also the target of a Michael draft's Save. */
export async function POST(request: Request, context: Context) {
  try {
    const owner = await organizationMemoryOwner((await context.params).organizationId, "manage");
    const body = await readJson(request);
    if (!body.ok) return invalidMemoryRequest();
    const parsed = memoryInputSchema.safeParse(body.body);
    if (!parsed.success) return invalidMemoryRequest(parsed.error.flatten().fieldErrors);
    return privateJson({ memory: await createMemory(owner, parsed.data) }, { status: 201 });
  } catch (error) {
    return memoryErrorResponse(error) ?? organizationErrorResponse(error);
  }
}

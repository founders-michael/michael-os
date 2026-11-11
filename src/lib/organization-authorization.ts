import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasOrganizationPermission, type OrganizationPermission } from "@/lib/organization-permissions";
import { assertUserProductPermission, ProductAccessError } from "@/lib/product-authorization";

export class OrganizationApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export async function requireOrganizationUser() {
  let session;
  try { session = await auth.api.getSession({ headers: await headers() }); }
  catch { throw new OrganizationApiError(401, "UNAUTHENTICATED", "Sign in to continue."); }
  if (!session) throw new OrganizationApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  try {
    await assertUserProductPermission(session.user.id, "WORK_OS_ACCESS");
  } catch (error) {
    if (error instanceof ProductAccessError) throw new OrganizationApiError(error.status, "WORKOS_ACCESS_REQUIRED", error.message);
    throw error;
  }
  return { id: session.user.id, email: session.user.email, emailVerified: session.user.emailVerified };
}

/** Authentication only, reserved for invitation inspection/response/acceptance before an entitlement exists. */
export async function requireAuthenticatedUser() {
  let session;
  try { session = await auth.api.getSession({ headers: await headers() }); }
  catch { throw new OrganizationApiError(401, "UNAUTHENTICATED", "Sign in to continue."); }
  if (!session) throw new OrganizationApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return { id: session.user.id, email: session.user.email, emailVerified: session.user.emailVerified };
}

export async function requireOrganizationMembership(organizationId: string) {
  const user = await requireOrganizationUser();
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, userId: user.id, status: "ACTIVE" },
    include: { organization: { include: { policy: true } } },
  });
  if (!membership) throw new OrganizationApiError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  if (!membership.organization.policy) throw new OrganizationApiError(403, "POLICY_UNAVAILABLE", "Organization access policy is unavailable.");
  return { user, membership, organization: membership.organization, managerScope: resolveManagerScope(membership.organization.policy.managerDefaultScope) };
}

export async function requireOrganizationPermission(organizationId: string, permission: OrganizationPermission) {
  const context = await requireOrganizationMembership(organizationId);
  if (!hasOrganizationPermission(context.membership.role, context.managerScope, permission)) {
    throw new OrganizationApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  return context;
}

/** Resource context is an extension point for project overrides and team checks; W1 has neither model. */
export function resolveManagerScope(managerDefaultScope: "TEAM" | "ORGANIZATION", _resourceContext?: { teamId?: string; projectId?: string }) {
  void _resourceContext;
  return managerDefaultScope;
}

export function organizationErrorResponse(error: unknown) {
  if (error instanceof ProductAccessError) {
    return Response.json({ error: error.message, code: "WORKOS_ACCESS_REQUIRED" }, { status: error.status });
  }
  if (error instanceof OrganizationApiError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, ...(error.status === 503 ? { headers: { "Retry-After": "2" } } : {}) },
    );
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    return Response.json({ error: "A record with those details already exists.", code: "CONFLICT" }, { status: 409 });
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
    return Response.json({ error: "This organization changed during the request. Please retry.", code: "CONCURRENT_UPDATE" }, { status: 409 });
  }
  // Keep server-side diagnostics useful without logging SQL, request bodies,
  // user data, connection details, or other potentially sensitive messages.
  const details = typeof error === "object" && error !== null
    ? {
        name: "name" in error && typeof error.name === "string" ? error.name : "UnknownError",
        code: "code" in error && typeof error.code === "string" ? error.code : undefined,
      }
    : { name: "UnknownError" };
  console.error("[organizations] Request failed.", details);
  return Response.json({ error: "We couldn't complete that organization request.", code: "INTERNAL_ERROR" }, { status: 500 });
}

export async function readOrganizationJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try { return { ok: true, body: await request.json() as unknown }; }
  catch { return { ok: false }; }
}

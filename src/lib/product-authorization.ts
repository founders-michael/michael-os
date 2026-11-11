import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ProductPermission } from "@/generated/prisma/client";
import { canManageProductAccess } from "@/lib/product-permission-policy";

export class ProductAccessError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
    this.name = "ProductAccessError";
  }
}

export async function getUserProductPermissions(userId: string): Promise<ProductPermission[]> {
  const grants = await prisma.userProductPermission.findMany({
    where: { userId },
    select: { permission: true },
    orderBy: { permission: "asc" },
  });
  return grants.map(({ permission }) => permission);
}

export async function hasProductPermission(userId: string, permission: ProductPermission): Promise<boolean> {
  return (await prisma.userProductPermission.findUnique({
    where: { userId_permission: { userId, permission } },
    select: { id: true },
  })) !== null;
}

/** The supplied identity must match the live Better Auth session. */
export async function requireProductPermission(userId: string, permission: ProductPermission): Promise<void> {
  let session;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    throw new ProductAccessError(401, "Sign in to continue.");
  }
  if (!session) throw new ProductAccessError(401, "Sign in to continue.");
  if (session.user.id !== userId) throw new ProductAccessError(403, "You do not have access to this product.");
  await assertUserProductPermission(userId, permission);
}

/** Use only after the caller has resolved this ID from the trusted server session. */
export async function assertUserProductPermission(userId: string, permission: ProductPermission): Promise<void> {
  if (!(await hasProductPermission(userId, permission))) {
    throw new ProductAccessError(403, "You do not have access to this product.");
  }
}

const productAccessAdministrators = new Set(
  (process.env.MICHAELOS_PRODUCT_ACCESS_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

async function requireProductAccessAdministrator(targetUserId: string, actorUserId: string) {
  let session;
  try { session = await auth.api.getSession({ headers: await headers() }); }
  catch { throw new ProductAccessError(401, "Sign in to manage product access."); }
  if (!session) throw new ProductAccessError(401, "Sign in to manage product access.");
  if (session.user.id !== actorUserId) throw new ProductAccessError(403, "You are not authorized to manage product access.");
  if (!canManageProductAccess(targetUserId, actorUserId, productAccessAdministrators)) {
    throw new ProductAccessError(403, "You are not authorized to manage product access.");
  }
}

/** Administrative service operation. No public route exposes this capability. */
export async function grantProductPermission(
  userId: string,
  permission: ProductPermission,
  grantedBy: string,
) {
  await requireProductAccessAdministrator(userId, grantedBy);
  return prisma.userProductPermission.upsert({
    where: { userId_permission: { userId, permission } },
    create: { userId, permission, grantedBy },
    update: {},
    select: { id: true, userId: true, permission: true, grantedAt: true, grantedBy: true },
  });
}

/** Administrative service operation; removing WorkOS access leaves memberships intact. */
export async function revokeProductPermission(
  userId: string,
  permission: ProductPermission,
  revokedBy: string,
) {
  await requireProductAccessAdministrator(userId, revokedBy);
  return prisma.userProductPermission.deleteMany({ where: { userId, permission } });
}

/** Shared gate for personal APIs. The API still scopes every query to the returned user ID. */
export async function authenticatedLifestyleUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) return null;
    return session.user.id;
  } catch {
    return null;
  }
}

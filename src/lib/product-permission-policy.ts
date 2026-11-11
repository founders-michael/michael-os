import type { ProductPermission } from "@/generated/prisma/client";
import type { ProductExperience } from "@/lib/product-entry";

export const NEW_USER_PRODUCT_PERMISSIONS = ["LIFESTYLE_OS_ACCESS"] as const satisfies readonly ProductPermission[];

export function canManageProductAccess(targetUserId: string, actorUserId: string, administratorIds: ReadonlySet<string>) {
  return targetUserId !== actorUserId && administratorIds.has(actorUserId);
}

export function productExperiencesForPermissions(permissions: readonly ProductPermission[]): ProductExperience[] {
  const allowed = new Set(permissions);
  return [
    ...(allowed.has("LIFESTYLE_OS_ACCESS") ? ["lifestyle" as const] : []),
    ...(allowed.has("WORK_OS_ACCESS") ? ["work" as const] : []),
  ];
}

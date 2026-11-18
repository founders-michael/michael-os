import "server-only";

import { APIError } from "better-auth/api";
import { prisma } from "@/lib/prisma";
import { lifestyleInvalidationTags } from "@/lib/resource-cache";
import { invalidateCacheTags } from "@/lib/server-cache";

export const ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION = "ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION";

/**
 * Refuses to delete an account that has ever belonged to an organization.
 *
 * Personal data cascades from the user row, so a LifestyleOS-only account
 * deletes cleanly. Organization records do not: a membership is kept after
 * someone leaves because work tasks, assignments and the audit trail point at
 * it, and the schema restricts deleting a user it references. Removing or
 * anonymizing a person inside an organization's records is a decision about
 * that organization's data, so it is refused here with a code rather than
 * guessed at. Checked before the delete so the caller gets a clear answer
 * instead of a foreign-key error.
 */
export async function assertAccountCanBeDeleted(userId: string) {
  const memberships = await prisma.organizationMembership.count({ where: { userId } });
  if (memberships > 0) {
    throw new APIError("CONFLICT", {
      code: ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION,
      message: "This account belongs to an organization, so it can't be deleted here yet. Contact support to delete it.",
    });
  }
}

/** Drops cached personal reads so nothing outlives the account. A cache failure never blocks the deletion. */
export async function purgeDeletedAccountCache(userId: string) {
  const tags = new Set([
    ...lifestyleInvalidationTags.taskMutation(userId),
    ...lifestyleInvalidationTags.goalMutation(userId),
    ...lifestyleInvalidationTags.habitMutation(userId),
    ...lifestyleInvalidationTags.availabilityMutation(userId),
    ...lifestyleInvalidationTags.memoryMutation(userId),
  ]);
  try { await invalidateCacheTags([...tags]); }
  catch { console.error("[account-deletion] Account deleted, but its cached reads could not be cleared."); }
}

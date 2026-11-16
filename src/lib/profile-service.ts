import "server-only";

import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";
import type { ProfileProgressInput, ProfileRoutineInput } from "@/lib/profile-validation";
import { invalidateCacheTags } from "@/lib/server-cache";
import { lifestyleInvalidationTags } from "@/lib/resource-cache";

export async function getProfileForUser(userId: string) {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  return profile ? { ...profile, timeZone: effectiveTimeZone(profile.timeZone) } : profile;
}

export async function saveProfileProgress(userId: string, input: ProfileProgressInput) {
  const { onboardingStep, ...profileData } = input;
  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...profileData, onboardingStep },
    update: { ...profileData, onboardingStep },
  });
  if (profileData.timeZone !== undefined) await invalidateCacheTags(lifestyleInvalidationTags.availabilityMutation(userId));
  return profile;
}

/**
 * Routine and planning preferences only — never the preferred name, which
 * Settings → Account owns. Returns null when the user has no profile yet
 * (onboarding creates it). One statement scoped by `userId`, so it needs no
 * read-then-write transaction.
 */
export async function saveProfileRoutine(userId: string, input: ProfileRoutineInput) {
  const { count } = await prisma.userProfile.updateMany({ where: { userId }, data: input });
  if (count === 0) return null;
  await invalidateCacheTags(lifestyleInvalidationTags.availabilityMutation(userId));
  return getProfileForUser(userId);
}

export async function completeOnboarding(userId: string) {
  const profile = await getProfileForUser(userId);

  if (!profile || profile.onboardingStep < 5 || !profile.preferredName.trim()) {
    return null;
  }

  return prisma.userProfile.update({
    where: { userId },
    data: { onboardingCompleted: true, onboardingStep: 5 },
  });
}

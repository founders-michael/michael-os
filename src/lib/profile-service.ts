import "server-only";

import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";
import type { ProfileProgressInput, ProfileRoutineInput } from "@/lib/profile-validation";
import { invalidateCacheTags } from "@/lib/server-cache";
import { lifestyleInvalidationTags } from "@/lib/resource-cache";
import { ensureDigestSchedule, resetDigestTimes } from "@/lib/digest-service";

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
  if (profileData.timeZone !== undefined) {
    await invalidateCacheTags(lifestyleInvalidationTags.availabilityMutation(userId));
    // Habit nudges and goal check-ins are on the user's clock: the next job run recomputes their times.
    await resetDigestTimes(userId);
  }
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
  // The routine carries the time zone: digest times are recomputed on the (possibly new) clock.
  await resetDigestTimes(userId);
  return getProfileForUser(userId);
}

export async function completeOnboarding(userId: string) {
  const profile = await getProfileForUser(userId);

  if (!profile || profile.onboardingStep < 5 || !profile.preferredName.trim()) {
    return null;
  }

  const completed = await prisma.userProfile.update({
    where: { userId },
    data: { onboardingCompleted: true, onboardingStep: 5 },
  });
  // The default habit nudge and goal check-in; the next job run schedules their first send.
  await ensureDigestSchedule(userId);
  return completed;
}

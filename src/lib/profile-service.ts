import "server-only";

import { prisma } from "@/lib/prisma";
import type { ProfileProgressInput } from "@/lib/profile-validation";

export async function getProfileForUser(userId: string) {
  return prisma.userProfile.findUnique({ where: { userId } });
}

export async function saveProfileProgress(userId: string, input: ProfileProgressInput) {
  const { onboardingStep, ...profileData } = input;

  return prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...profileData, onboardingStep },
    update: { ...profileData, onboardingStep },
  });
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

-- CreateEnum
CREATE TYPE "HabitDigestMode" AS ENUM ('OFF', 'MORNING', 'EVENING', 'BOTH');

-- CreateEnum
CREATE TYPE "GoalDigestFrequency" AS ENUM ('OFF', 'DAILY', 'WEEKLY', 'MONTHLY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'HABIT_DIGEST';
ALTER TYPE "NotificationKind" ADD VALUE 'GOAL_DIGEST';

-- CreateTable
CREATE TABLE "DigestSchedule" (
    "userId" TEXT NOT NULL,
    "habitsMode" "HabitDigestMode" NOT NULL DEFAULT 'MORNING',
    "habitsMorningTime" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "habitsEveningTime" VARCHAR(5) NOT NULL DEFAULT '20:00',
    "goalsFrequency" "GoalDigestFrequency" NOT NULL DEFAULT 'WEEKLY',
    "goalsWeekday" SMALLINT NOT NULL DEFAULT 1,
    "goalsTime" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "nextHabitsAt" TIMESTAMPTZ(3),
    "nextGoalsAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestSchedule_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "DigestSchedule_due_habits_idx" ON "DigestSchedule"("nextHabitsAt") WHERE ("nextHabitsAt" IS NOT NULL);

-- CreateIndex
CREATE INDEX "DigestSchedule_due_goals_idx" ON "DigestSchedule"("nextGoalsAt") WHERE ("nextGoalsAt" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "DigestSchedule" ADD CONSTRAINT "DigestSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Hand-written: rules Prisma cannot express, and the starting schedule for existing users.
ALTER TABLE "DigestSchedule" ADD CONSTRAINT "DigestSchedule_values_check" CHECK (
  "habitsMorningTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "habitsEveningTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "goalsTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "goalsWeekday" BETWEEN 1 AND 7
);
-- Everyone who finished onboarding gets the default schedule (morning habit nudge, weekly goal check-in);
-- the reminder job computes their first send time on its next run.
INSERT INTO "DigestSchedule" ("userId", "updatedAt")
SELECT "userId", CURRENT_TIMESTAMP FROM "UserProfile" WHERE "onboardingCompleted" = true
ON CONFLICT ("userId") DO NOTHING;

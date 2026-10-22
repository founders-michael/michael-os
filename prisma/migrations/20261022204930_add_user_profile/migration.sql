-- CreateEnum
CREATE TYPE "PlanningStyle" AS ENUM ('STRUCTURED', 'BALANCED', 'FLEXIBLE');

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "preferredName" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "wakeUpTime" TEXT NOT NULL DEFAULT '07:00',
    "bedtime" TEXT NOT NULL DEFAULT '22:30',
    "workStartTime" TEXT,
    "workEndTime" TEXT,
    "workDays" TEXT[] DEFAULT ARRAY['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']::TEXT[],
    "priorities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "focusSessionMinutes" INTEGER NOT NULL DEFAULT 50,
    "breakDurationMinutes" INTEGER NOT NULL DEFAULT 10,
    "planningStyle" "PlanningStyle" NOT NULL DEFAULT 'BALANCED',
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

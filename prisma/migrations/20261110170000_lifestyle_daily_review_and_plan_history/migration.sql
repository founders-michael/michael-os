-- CreateEnum
CREATE TYPE "PersonalTaskPlanChangeType" AS ENUM ('DUE_DATE_SNAPSHOT', 'DUE_DATE_CHANGED', 'SESSION_RESCHEDULED');

-- CreateTable
CREATE TABLE "DailyReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewDate" DATE NOT NULL,
    "wentWell" TEXT,
    "challenges" TEXT,
    "blockers" TEXT,
    "lessonsLearned" TEXT,
    "improvements" TEXT,
    "intentionallySkippedTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalTaskPlanHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "changeType" "PersonalTaskPlanChangeType" NOT NULL,
    "taskDueDate" DATE,
    "calendarEventId" TEXT,
    "plannedStartAt" TIMESTAMPTZ(3),
    "plannedEndAt" TIMESTAMPTZ(3),
    "timeZone" VARCHAR(100),
    "title" VARCHAR(160),
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalTaskPlanHistory_pkey" PRIMARY KEY ("id")
);

-- Preserve the currently known task due date as a historical baseline.
-- Earlier due-date changes cannot be reconstructed from the existing schema.
INSERT INTO "PersonalTaskPlanHistory" ("id", "userId", "taskId", "changeType", "taskDueDate", "recordedAt")
SELECT 'plan_' || md5(random()::text || clock_timestamp()::text), "userId", "id", 'DUE_DATE_SNAPSHOT', "dueDate", "updatedAt"
FROM "Task"
WHERE "dueDate" IS NOT NULL;

-- CreateIndex
CREATE INDEX "DailyReview_userId_reviewDate_idx" ON "DailyReview"("userId", "reviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReview_userId_reviewDate_key" ON "DailyReview"("userId", "reviewDate");

-- CreateIndex
CREATE INDEX "PersonalTaskPlanHistory_userId_taskId_recordedAt_idx" ON "PersonalTaskPlanHistory"("userId", "taskId", "recordedAt");

-- CreateIndex
CREATE INDEX "PersonalTaskPlanHistory_userId_taskDueDate_recordedAt_idx" ON "PersonalTaskPlanHistory"("userId", "taskDueDate", "recordedAt");

-- CreateIndex
CREATE INDEX "PersonalTaskPlanHistory_userId_plannedStartAt_plannedEndAt_idx" ON "PersonalTaskPlanHistory"("userId", "plannedStartAt", "plannedEndAt");

-- AddForeignKey
ALTER TABLE "DailyReview" ADD CONSTRAINT "DailyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTaskPlanHistory" ADD CONSTRAINT "PersonalTaskPlanHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTaskPlanHistory" ADD CONSTRAINT "PersonalTaskPlanHistory_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

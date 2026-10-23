-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('TASK_SESSION', 'COMMITMENT', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "SchedulingMode" AS ENUM ('FIXED', 'FLEXIBLE');

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "eventType" "CalendarEventType" NOT NULL,
    "schedulingMode" "SchedulingMode" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "timeZone" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_startAt_idx" ON "CalendarEvent"("userId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_endAt_idx" ON "CalendarEvent"("userId", "endAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_startAt_endAt_idx" ON "CalendarEvent"("userId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_taskId_idx" ON "CalendarEvent"("taskId");

-- CreateIndex
CREATE INDEX "AvailabilityWindow_userId_active_weekday_idx" ON "AvailabilityWindow"("userId", "active", "weekday");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

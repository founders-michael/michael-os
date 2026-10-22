-- CreateEnum
CREATE TYPE "HabitFrequency" AS ENUM ('DAILY', 'SELECTED_DAYS');

-- CreateEnum
CREATE TYPE "HabitStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "frequency" "HabitFrequency" NOT NULL DEFAULT 'DAILY',
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" "HabitStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitCheckIn" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Habit_userId_status_idx" ON "Habit"("userId", "status");

-- CreateIndex
CREATE INDEX "Habit_userId_createdAt_idx" ON "Habit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HabitCheckIn_habitId_localDate_idx" ON "HabitCheckIn"("habitId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCheckIn_habitId_localDate_key" ON "HabitCheckIn"("habitId", "localDate");

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCheckIn" ADD CONSTRAINT "HabitCheckIn_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GoalMilestoneStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(80),
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "targetDate" DATE,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalMilestone" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "GoalMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE INDEX "Goal_userId_targetDate_idx" ON "Goal"("userId", "targetDate");

-- CreateIndex
CREATE INDEX "Goal_userId_createdAt_idx" ON "Goal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GoalMilestone_goalId_position_idx" ON "GoalMilestone"("goalId", "position");

-- CreateIndex
CREATE INDEX "GoalMilestone_goalId_status_idx" ON "GoalMilestone"("goalId", "status");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalMilestone" ADD CONSTRAINT "GoalMilestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

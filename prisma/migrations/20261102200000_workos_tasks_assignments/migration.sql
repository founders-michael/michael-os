-- CreateEnum
CREATE TYPE "WorkTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "WorkTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "WorkTaskActivityType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'ASSOCIATION_CHANGED', 'DEPENDENCY_ADDED', 'DEPENDENCY_REMOVED', 'ARCHIVED', 'RESTORED');

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "teamId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "WorkTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "startDate" DATE,
    "dueDate" DATE,
    "estimatedMinutes" INTEGER,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTaskAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTaskDependency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnTaskId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTaskActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" "WorkTaskActivityType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkTask_organizationId_status_priority_dueDate_idx" ON "WorkTask"("organizationId", "status", "priority", "dueDate");

-- CreateIndex
CREATE INDEX "WorkTask_organizationId_projectId_status_idx" ON "WorkTask"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "WorkTask_organizationId_teamId_status_idx" ON "WorkTask"("organizationId", "teamId", "status");

-- CreateIndex
CREATE INDEX "WorkTask_organizationId_createdById_createdAt_idx" ON "WorkTask"("organizationId", "createdById", "createdAt");

-- CreateIndex
CREATE INDEX "WorkTask_organizationId_updatedAt_idx" ON "WorkTask"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTask_id_organizationId_key" ON "WorkTask"("id", "organizationId");

-- CreateIndex
CREATE INDEX "WorkTaskAssignment_organizationId_userId_removedAt_assigned_idx" ON "WorkTaskAssignment"("organizationId", "userId", "removedAt", "assignedAt");

-- CreateIndex
CREATE INDEX "WorkTaskAssignment_organizationId_taskId_removedAt_idx" ON "WorkTaskAssignment"("organizationId", "taskId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTaskAssignment_one_active_per_user_key" ON "WorkTaskAssignment"("organizationId", "taskId", "userId") WHERE ("removedAt" IS NULL);

-- CreateIndex
CREATE INDEX "WorkTaskDependency_organizationId_dependsOnTaskId_idx" ON "WorkTaskDependency"("organizationId", "dependsOnTaskId");

-- CreateIndex
CREATE INDEX "WorkTaskDependency_organizationId_taskId_idx" ON "WorkTaskDependency"("organizationId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTaskDependency_organizationId_taskId_dependsOnTaskId_key" ON "WorkTaskDependency"("organizationId", "taskId", "dependsOnTaskId");

-- CreateIndex
CREATE INDEX "WorkTaskActivity_organizationId_taskId_createdAt_idx" ON "WorkTaskActivity"("organizationId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkTaskActivity_organizationId_actorId_createdAt_idx" ON "WorkTaskActivity"("organizationId", "actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_teamId_organizationId_fkey" FOREIGN KEY ("teamId", "organizationId") REFERENCES "Team"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_organizationId_createdById_fkey" FOREIGN KEY ("organizationId", "createdById") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskAssignment" ADD CONSTRAINT "WorkTaskAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskAssignment" ADD CONSTRAINT "WorkTaskAssignment_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "WorkTask"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskAssignment" ADD CONSTRAINT "WorkTaskAssignment_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskAssignment" ADD CONSTRAINT "WorkTaskAssignment_organizationId_assignedById_fkey" FOREIGN KEY ("organizationId", "assignedById") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskDependency" ADD CONSTRAINT "WorkTaskDependency_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskDependency" ADD CONSTRAINT "WorkTaskDependency_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "WorkTask"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskDependency" ADD CONSTRAINT "WorkTaskDependency_dependsOnTaskId_organizationId_fkey" FOREIGN KEY ("dependsOnTaskId", "organizationId") REFERENCES "WorkTask"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskDependency" ADD CONSTRAINT "WorkTaskDependency_organizationId_createdById_fkey" FOREIGN KEY ("organizationId", "createdById") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskActivity" ADD CONSTRAINT "WorkTaskActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskActivity" ADD CONSTRAINT "WorkTaskActivity_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "WorkTask"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskActivity" ADD CONSTRAINT "WorkTaskActivity_organizationId_actorId_fkey" FOREIGN KEY ("organizationId", "actorId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

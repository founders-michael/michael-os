-- CreateEnum
CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "WorkTask" ADD COLUMN     "milestoneId" TEXT;

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "targetDate" DATE,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMilestone_organizationId_projectId_position_idx" ON "ProjectMilestone"("organizationId", "projectId", "position");

-- CreateIndex
CREATE INDEX "ProjectMilestone_organizationId_projectId_status_idx" ON "ProjectMilestone"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMilestone_id_organizationId_key" ON "ProjectMilestone"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMilestone_organizationId_projectId_title_key" ON "ProjectMilestone"("organizationId", "projectId", "title");

-- CreateIndex
CREATE INDEX "WorkTask_organizationId_milestoneId_status_idx" ON "WorkTask"("organizationId", "milestoneId", "status");

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_organizationId_createdById_fkey" FOREIGN KEY ("organizationId", "createdById") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_milestoneId_organizationId_fkey" FOREIGN KEY ("milestoneId", "organizationId") REFERENCES "ProjectMilestone"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

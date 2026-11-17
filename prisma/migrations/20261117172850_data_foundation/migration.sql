-- CreateEnum
CREATE TYPE "TaxonomyNamespace" AS ENUM ('CORE', 'PERSONAL', 'WORK', 'INDUSTRY', 'INTELLIGENCE', 'PLATFORM');

-- CreateEnum
CREATE TYPE "DataSensitivity" AS ENUM ('STANDARD', 'PERSONAL', 'SENSITIVE');

-- CreateEnum
CREATE TYPE "DataPurpose" AS ENUM ('ASSISTANT_CONTEXT', 'PLANNING', 'INSIGHTS', 'ORGANIZATION_REPORTING');

-- CreateEnum
CREATE TYPE "RetentionPolicy" AS ENUM ('FOLLOWS_RECORD');

-- CreateEnum
CREATE TYPE "TaxonomyStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ClassifiableEntityType" AS ENUM ('TASK', 'GOAL', 'HABIT', 'CALENDAR_EVENT', 'WORK_TASK', 'PROJECT');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('USER_INPUT', 'INTEGRATION', 'DEVICE_OBSERVATION', 'APP_ACTIVITY', 'AI_INFERENCE', 'AI_PREDICTION', 'IMPORT');

-- CreateTable
CREATE TABLE "TaxonomyCategory" (
    "key" VARCHAR(120) NOT NULL,
    "namespace" "TaxonomyNamespace" NOT NULL,
    "level" SMALLINT NOT NULL,
    "parentKey" VARCHAR(120),
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "sensitivity" "DataSensitivity" NOT NULL,
    "permittedPurposes" "DataPurpose"[],
    "retention" "RetentionPolicy" NOT NULL,
    "entityTypes" "ClassifiableEntityType"[],
    "status" "TaxonomyStatus" NOT NULL DEFAULT 'ACTIVE',
    "schemaVersion" INTEGER NOT NULL,
    "registryVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TaxonomyCategory_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EntityClassification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "taskId" TEXT,
    "goalId" TEXT,
    "habitId" TEXT,
    "calendarEventId" TEXT,
    "workTaskId" TEXT,
    "projectId" TEXT,
    "categoryKey" VARCHAR(120) NOT NULL,
    "source" "DataSource" NOT NULL,
    "confidence" DECIMAL(4,3),
    "sourceRef" VARCHAR(200),
    "createdById" TEXT,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityClassification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxonomyCategory_namespace_status_level_idx" ON "TaxonomyCategory"("namespace", "status", "level");

-- CreateIndex
CREATE INDEX "TaxonomyCategory_parentKey_idx" ON "TaxonomyCategory"("parentKey");

-- CreateIndex
CREATE INDEX "EntityClassification_userId_categoryKey_idx" ON "EntityClassification"("userId", "categoryKey");

-- CreateIndex
CREATE INDEX "EntityClassification_organizationId_categoryKey_idx" ON "EntityClassification"("organizationId", "categoryKey");

-- CreateIndex
CREATE INDEX "EntityClassification_createdById_idx" ON "EntityClassification"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "EntityClassification_userId_taskId_categoryKey_source_key" ON "EntityClassification"("userId", "taskId", "categoryKey", "source");

-- CreateIndex
CREATE UNIQUE INDEX "EntityClassification_userId_goalId_categoryKey_source_key" ON "EntityClassification"("userId", "goalId", "categoryKey", "source");

-- CreateIndex
CREATE UNIQUE INDEX "EntityClassification_userId_habitId_categoryKey_source_key" ON "EntityClassification"("userId", "habitId", "categoryKey", "source");

-- CreateIndex
CREATE UNIQUE INDEX "EntityClassification_userId_calendarEventId_categoryKey_sou_key" ON "EntityClassification"("userId", "calendarEventId", "categoryKey", "source");

-- CreateIndex
CREATE UNIQUE INDEX "EntityClassification_organizationId_workTaskId_categoryKey__key" ON "EntityClassification"("organizationId", "workTaskId", "categoryKey", "source");

-- CreateIndex
CREATE UNIQUE INDEX "EntityClassification_organizationId_projectId_categoryKey_s_key" ON "EntityClassification"("organizationId", "projectId", "categoryKey", "source");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_id_userId_key" ON "CalendarEvent"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_id_userId_key" ON "Goal"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Habit_id_userId_key" ON "Habit"("id", "userId");

-- AddForeignKey
ALTER TABLE "TaxonomyCategory" ADD CONSTRAINT "TaxonomyCategory_parentKey_fkey" FOREIGN KEY ("parentKey") REFERENCES "TaxonomyCategory"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_categoryKey_fkey" FOREIGN KEY ("categoryKey") REFERENCES "TaxonomyCategory"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_goalId_userId_fkey" FOREIGN KEY ("goalId", "userId") REFERENCES "Goal"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_habitId_userId_fkey" FOREIGN KEY ("habitId", "userId") REFERENCES "Habit"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_workTaskId_organizationId_fkey" FOREIGN KEY ("workTaskId", "organizationId") REFERENCES "WorkTask"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: rules Prisma cannot express. See the model comments in schema.prisma.

-- A domain (level 2) has no parent; a subdomain (level 3) has one.
ALTER TABLE "TaxonomyCategory" ADD CONSTRAINT "TaxonomyCategory_level_parent_check"
  CHECK (("level" = 2 AND "parentKey" IS NULL) OR ("level" = 3 AND "parentKey" IS NOT NULL));

-- Exactly one record per row, and the owner column that matches its product:
-- personal records (task, goal, habit, calendar event) carry userId only; work
-- records (work task, project) carry organizationId only. With the composite
-- foreign keys this makes a cross-tenant or cross-product row impossible.
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_record_scope_check" CHECK (
  (num_nonnulls("taskId", "goalId", "habitId", "calendarEventId") = 1
    AND num_nonnulls("workTaskId", "projectId") = 0
    AND "userId" IS NOT NULL AND "organizationId" IS NULL)
  OR
  (num_nonnulls("workTaskId", "projectId") = 1
    AND num_nonnulls("taskId", "goalId", "habitId", "calendarEventId") = 0
    AND "organizationId" IS NOT NULL AND "userId" IS NULL)
);

-- An inference or prediction states how sure it is; a fact does not.
ALTER TABLE "EntityClassification" ADD CONSTRAINT "EntityClassification_confidence_check" CHECK (
  ("source" IN ('AI_INFERENCE', 'AI_PREDICTION') AND "confidence" IS NOT NULL AND "confidence" >= 0 AND "confidence" <= 1)
  OR ("source" NOT IN ('AI_INFERENCE', 'AI_PREDICTION') AND "confidence" IS NULL)
);

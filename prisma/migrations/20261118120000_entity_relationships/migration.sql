-- CreateEnum
CREATE TYPE "RelationshipKind" AS ENUM ('TASK_SUPPORTS_GOAL');

-- CreateTable
CREATE TABLE "EntityRelationship" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "RelationshipKind" NOT NULL,
    "taskId" TEXT,
    "goalId" TEXT,
    "source" "DataSource" NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityRelationship_userId_goalId_idx" ON "EntityRelationship"("userId", "goalId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityRelationship_userId_kind_taskId_goalId_source_key" ON "EntityRelationship"("userId", "kind", "taskId", "goalId", "source");

-- AddForeignKey
ALTER TABLE "EntityRelationship" ADD CONSTRAINT "EntityRelationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelationship" ADD CONSTRAINT "EntityRelationship_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelationship" ADD CONSTRAINT "EntityRelationship_goalId_userId_fkey" FOREIGN KEY ("goalId", "userId") REFERENCES "Goal"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: rules Prisma cannot express. See the model comments in schema.prisma.
-- Per kind, exactly its two records and the owner column. With the composite
-- foreign keys (MATCH SIMPLE, so userId must be non-null for them to bind) this
-- makes a link between two users' records impossible.
ALTER TABLE "EntityRelationship" ADD CONSTRAINT "EntityRelationship_kind_records_check" CHECK (
  "kind" = 'TASK_SUPPORTS_GOAL'
    AND "userId" IS NOT NULL AND "taskId" IS NOT NULL AND "goalId" IS NOT NULL
);

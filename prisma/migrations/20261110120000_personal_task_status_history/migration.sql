-- CreateTable
CREATE TABLE "TaskStatusHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "previousStatus" "TaskStatus",
    "status" "TaskStatus" NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskStatusHistory_userId_changedAt_idx" ON "TaskStatusHistory"("userId", "changedAt");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_taskId_changedAt_idx" ON "TaskStatusHistory"("taskId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_userId_key" ON "Task"("id", "userId");

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the completion timestamp already stored for tasks that are completed today.
-- Older completion cycles that were cleared by reopening a task cannot be reconstructed.
INSERT INTO "TaskStatusHistory" ("id", "userId", "taskId", "previousStatus", "status", "changedAt")
SELECT 'task_status_legacy_' || md5(task."id"), task."userId", task."id", NULL,
       'COMPLETED'::"TaskStatus", task."completedAt"
FROM "Task" AS task
WHERE task."status" = 'COMPLETED'::"TaskStatus"
  AND task."completedAt" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrenceId" TEXT;

-- CreateTable
CREATE TABLE "TaskRecurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "monthDay" INTEGER,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskRecurrence_userId_active_idx" ON "TaskRecurrence"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRecurrence_id_userId_key" ON "TaskRecurrence"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_recurrenceId_dueDate_key" ON "Task"("recurrenceId", "dueDate");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceId_userId_fkey" FOREIGN KEY ("recurrenceId", "userId") REFERENCES "TaskRecurrence"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Hand-written: rules Prisma cannot express. See the model comments in schema.prisma.
-- Each rule's shape, with IS NOT NULL stated so a missing value fails rather than passes.
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_rule_check" CHECK (
  "weekdays" IS NOT NULL
  AND "interval" BETWEEN 1 AND 99
  AND ("endsOn" IS NULL OR "endsOn" >= "startsOn")
  AND CASE "frequency"
    WHEN 'WEEKLY' THEN cardinality("weekdays") BETWEEN 1 AND 7 AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7] AND "monthDay" IS NULL
    WHEN 'MONTHLY' THEN cardinality("weekdays") = 0 AND "monthDay" IS NOT NULL AND "monthDay" BETWEEN 1 AND 31
    ELSE cardinality("weekdays") = 0 AND "monthDay" IS NULL
  END
);
-- An occurrence of a series always has a due date: the schedule is computed from it.
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrence_due_check" CHECK ("recurrenceId" IS NULL OR "dueDate" IS NOT NULL);

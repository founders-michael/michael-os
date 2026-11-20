-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('TASK_REMINDER');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "remindAt" TIMESTAMPTZ(3),
ADD COLUMN     "reminderSentAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "taskId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500),
    "link" VARCHAR(300),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Task_due_reminder_idx" ON "Task"("remindAt") WHERE ("reminderSentAt" IS NULL AND "remindAt" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Hand-written: rules Prisma cannot express. See the model comments in schema.prisma.
-- A notification links only inside the app.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_link_check" CHECK ("link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%'));
-- A reminder can only have been sent if one is set.
ALTER TABLE "Task" ADD CONSTRAINT "Task_reminder_check" CHECK ("reminderSentAt" IS NULL OR "remindAt" IS NOT NULL);

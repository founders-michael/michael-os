-- CreateEnum
CREATE TYPE "OutcomeKind" AS ENUM ('DRAFT_SAVED', 'DRAFT_DISCARDED', 'SUGGESTION_SHOWN', 'SUGGESTION_CONFIRMED', 'SUGGESTION_DISMISSED', 'PLAN_SESSION_KEPT', 'PLAN_SESSION_DESELECTED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DISMISSED');

-- CreateTable
CREATE TABLE "OutcomeEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "kind" "OutcomeKind" NOT NULL,
    "subject" VARCHAR(80) NOT NULL,
    "localHour" SMALLINT,
    "durationMinutes" INTEGER,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutcomeEvent_userId_kind_recordedAt_idx" ON "OutcomeEvent"("userId", "kind", "recordedAt");

-- CreateIndex
CREATE INDEX "OutcomeEvent_organizationId_kind_recordedAt_idx" ON "OutcomeEvent"("organizationId", "kind", "recordedAt");

-- CreateIndex
CREATE INDEX "OutcomeEvent_actorUserId_idx" ON "OutcomeEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Hand-written: rules Prisma cannot express. See the model comments in schema.prisma.
-- One owner, never both; a personal row names no separate actor.
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_scope_check" CHECK (
  ("userId" IS NOT NULL) <> ("organizationId" IS NOT NULL)
  AND ("userId" IS NULL OR "actorUserId" IS NULL)
);
-- Session timing belongs to planned sessions only, and is always present on them.
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_session_check" CHECK (
  CASE WHEN "kind" IN ('PLAN_SESSION_KEPT', 'PLAN_SESSION_DESELECTED')
    THEN "localHour" BETWEEN 0 AND 23 AND "durationMinutes" BETWEEN 1 AND 1440
    ELSE "localHour" IS NULL AND "durationMinutes" IS NULL
  END
);
-- A fixed vocabulary, never user content: draft kinds, registered category keys, proposal keys.
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_subject_check" CHECK (
  "subject" ~ '^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$'
);

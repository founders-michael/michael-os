-- CreateTable
CREATE TABLE "MemoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "lineageId" TEXT,
    "supersedesId" TEXT,
    "content" VARCHAR(280) NOT NULL,
    "sensitivity" "DataSensitivity" NOT NULL DEFAULT 'STANDARD',
    "source" "DataSource" NOT NULL,
    "confidence" DECIMAL(4,3),
    "sourceRef" VARCHAR(200),
    "createdById" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "supersededAt" TIMESTAMPTZ(3),
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemoryItem_supersedesId_key" ON "MemoryItem"("supersedesId");

-- CreateIndex
CREATE INDEX "MemoryItem_userId_supersededAt_recordedAt_idx" ON "MemoryItem"("userId", "supersededAt", "recordedAt");

-- CreateIndex
CREATE INDEX "MemoryItem_organizationId_supersededAt_recordedAt_idx" ON "MemoryItem"("organizationId", "supersededAt", "recordedAt");

-- CreateIndex
CREATE INDEX "MemoryItem_userId_lineageId_idx" ON "MemoryItem"("userId", "lineageId");

-- CreateIndex
CREATE INDEX "MemoryItem_organizationId_lineageId_idx" ON "MemoryItem"("organizationId", "lineageId");

-- CreateIndex
CREATE INDEX "MemoryItem_createdById_idx" ON "MemoryItem"("createdById");

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "MemoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Hand-written: rules Prisma cannot express. See the model comments in schema.prisma.
-- One owner, never both: a personal memory never becomes visible to an organization or the reverse.
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_scope_check" CHECK (
  ("userId" IS NOT NULL) <> ("organizationId" IS NOT NULL)
);
-- A WorkOS memory names its writer; a personal one never does.
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_writer_check" CHECK (
  "userId" IS NULL OR "createdById" IS NULL
);
-- Inferences carry a confidence; facts a person saved never do.
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_confidence_check" CHECK (
  CASE WHEN "source" IN ('AI_INFERENCE', 'AI_PREDICTION')
    THEN "confidence" IS NOT NULL AND "confidence" >= 0 AND "confidence" <= 1
    ELSE "confidence" IS NULL
  END
);
-- A first version has neither link; every later version has both.
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_lineage_check" CHECK (
  ("lineageId" IS NULL) = ("supersedesId" IS NULL)
);
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_content_check" CHECK (
  char_length(btrim("content")) BETWEEN 1 AND 280
);

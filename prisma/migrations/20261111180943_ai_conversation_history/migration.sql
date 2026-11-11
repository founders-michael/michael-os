-- CreateEnum
CREATE TYPE "AiProductContext" AS ENUM ('LIFESTYLE', 'WORK');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "product" "AiProductContext" NOT NULL,
    "organizationId" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolActivity" JSONB NOT NULL DEFAULT '[]',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiConversation_userId_product_lastMessageAt_idx" ON "AiConversation"("userId", "product", "lastMessageAt");

-- CreateIndex
CREATE INDEX "AiConversation_userId_archivedAt_lastMessageAt_idx" ON "AiConversation"("userId", "archivedAt", "lastMessageAt");

-- CreateIndex
CREATE INDEX "AiConversation_organizationId_idx" ON "AiConversation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiConversation_id_userId_key" ON "AiConversation"("id", "userId");

-- CreateIndex
CREATE INDEX "AiConversationMessage_conversationId_createdAt_idx" ON "AiConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiConversationMessage_userId_createdAt_idx" ON "AiConversationMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversationMessage" ADD CONSTRAINT "AiConversationMessage_conversationId_userId_fkey" FOREIGN KEY ("conversationId", "userId") REFERENCES "AiConversation"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "KnowledgeBaseEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotAnswerCache" (
    "id" TEXT NOT NULL,
    "questionHash" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotAnswerCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotAnswerCache_questionHash_key" ON "BotAnswerCache"("questionHash");

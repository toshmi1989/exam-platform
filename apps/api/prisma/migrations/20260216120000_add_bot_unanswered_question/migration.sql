-- CreateTable
CREATE TABLE "BotUnansweredQuestion" (
    "id" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "telegramId" TEXT,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotUnansweredQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotUnansweredQuestion_topic_idx" ON "BotUnansweredQuestion"("topic");

-- CreateIndex
CREATE INDEX "BotUnansweredQuestion_createdAt_idx" ON "BotUnansweredQuestion"("createdAt");

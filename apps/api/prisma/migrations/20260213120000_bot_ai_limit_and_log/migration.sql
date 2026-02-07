-- AlterTable
ALTER TABLE "AccessSettings" ADD COLUMN "botAiDailyLimitFree" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "BotAiRequestLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotAiRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotAiRequestLog_userId_createdAt_idx" ON "BotAiRequestLog"("userId", "createdAt");

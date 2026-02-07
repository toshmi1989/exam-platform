-- AlterTable
ALTER TABLE "OralAccessLog" ADD COLUMN "questionId" TEXT;

-- CreateIndex
CREATE INDEX "OralAccessLog_userId_questionId_createdAt_idx" ON "OralAccessLog"("userId", "questionId", "createdAt");

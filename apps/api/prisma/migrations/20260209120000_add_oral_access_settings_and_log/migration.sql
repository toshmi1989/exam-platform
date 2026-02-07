-- AlterTable
ALTER TABLE "AccessSettings" ADD COLUMN "freeOralDailyLimit" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "OralAccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OralAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OralAccessLog_userId_createdAt_idx" ON "OralAccessLog"("userId", "createdAt");

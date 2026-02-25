-- CreateTable
CREATE TABLE "SttUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SttUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SttUsageLog_userId_idx" ON "SttUsageLog"("userId");

-- CreateIndex
CREATE INDEX "SttUsageLog_createdAt_idx" ON "SttUsageLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SttUsageLog" ADD CONSTRAINT "SttUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

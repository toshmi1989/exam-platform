-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'EXPIRED');

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimeAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneTimeAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSubscription_userId_idx" ON "UserSubscription"("userId");

-- CreateIndex
CREATE INDEX "UserSubscription_endsAt_idx" ON "UserSubscription"("endsAt");

-- CreateIndex
CREATE INDEX "OneTimeAccess_userId_idx" ON "OneTimeAccess"("userId");

-- CreateIndex
CREATE INDEX "OneTimeAccess_examId_idx" ON "OneTimeAccess"("examId");

-- CreateIndex
CREATE INDEX "OneTimeAccess_consumedAt_idx" ON "OneTimeAccess"("consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeAccess_userId_examId_consumedAt_key" ON "OneTimeAccess"("userId", "examId", "consumedAt");

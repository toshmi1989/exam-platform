-- CreateTable
CREATE TABLE "AccessSettings" (
    "id" TEXT NOT NULL,
    "subscriptionPrice" INTEGER NOT NULL,
    "subscriptionDurationDays" INTEGER NOT NULL,
    "allowFreeAttempts" BOOLEAN NOT NULL,
    "freeDailyLimit" INTEGER NOT NULL,
    "showAnswersWithoutSubscription" BOOLEAN NOT NULL,
    "oneTimePrice" INTEGER NOT NULL,
    "showAnswersForOneTime" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessSettings_pkey" PRIMARY KEY ("id")
);

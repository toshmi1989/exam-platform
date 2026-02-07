-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dismissedBroadcastIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

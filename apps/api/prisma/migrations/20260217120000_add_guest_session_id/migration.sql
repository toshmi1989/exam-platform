-- AlterTable
ALTER TABLE "OneTimeAccess" 
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "guestSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeAccess_guestSessionId_key" ON "OneTimeAccess"("guestSessionId") WHERE "guestSessionId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "OneTimeAccess_guestSessionId_idx" ON "OneTimeAccess"("guestSessionId");

-- Drop existing unique constraint if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OneTimeAccess_userId_examId_consumedAt_key'
  ) THEN
    ALTER TABLE "OneTimeAccess" DROP CONSTRAINT "OneTimeAccess_userId_examId_consumedAt_key";
  END IF;
END $$;

-- Create unique partial indexes (PostgreSQL supports WHERE clause in unique indexes)
CREATE UNIQUE INDEX "OneTimeAccess_userId_examId_consumedAt_key" ON "OneTimeAccess"("userId", "examId", "consumedAt") WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX "OneTimeAccess_guestSessionId_examId_consumedAt_key" ON "OneTimeAccess"("guestSessionId", "examId", "consumedAt") WHERE "guestSessionId" IS NOT NULL;

-- AlterTable
ALTER TABLE "PaymentInvoice" 
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "guestSessionId" TEXT;

-- CreateIndex
CREATE INDEX "PaymentInvoice_guestSessionId_idx" ON "PaymentInvoice"("guestSessionId");

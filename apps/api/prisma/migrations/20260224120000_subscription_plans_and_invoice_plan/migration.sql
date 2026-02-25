-- AccessSettings: add 3 subscription plan columns
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan1Name" TEXT DEFAULT 'Подписка';
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan1Price" INTEGER DEFAULT 99000;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan1DurationDays" INTEGER DEFAULT 30;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan1Enabled" BOOLEAN DEFAULT true;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan2Name" TEXT;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan2Price" INTEGER DEFAULT 0;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan2DurationDays" INTEGER DEFAULT 0;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan2Enabled" BOOLEAN DEFAULT false;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan3Name" TEXT;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan3Price" INTEGER DEFAULT 0;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan3DurationDays" INTEGER DEFAULT 0;
ALTER TABLE "AccessSettings" ADD COLUMN IF NOT EXISTS "plan3Enabled" BOOLEAN DEFAULT false;

-- PaymentInvoice: store plan duration and name for subscription
ALTER TABLE "PaymentInvoice" ADD COLUMN IF NOT EXISTS "subscriptionDurationDays" INTEGER;
ALTER TABLE "PaymentInvoice" ADD COLUMN IF NOT EXISTS "subscriptionPlanName" TEXT;

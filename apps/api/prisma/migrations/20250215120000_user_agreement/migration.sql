-- AlterTable
ALTER TABLE "User" ADD COLUMN "acceptedTerms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "agreementVersion" TEXT;

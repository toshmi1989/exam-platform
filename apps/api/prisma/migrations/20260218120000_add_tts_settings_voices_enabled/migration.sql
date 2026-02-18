-- AlterTable
ALTER TABLE "TtsSettings" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TtsSettings" ADD COLUMN "voiceRu" TEXT;
ALTER TABLE "TtsSettings" ADD COLUMN "voiceUz" TEXT;

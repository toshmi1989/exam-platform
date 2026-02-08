-- AlterTable
ALTER TABLE "Exam" ADD COLUMN "directionGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Exam_directionGroupId_idx" ON "Exam"("directionGroupId");

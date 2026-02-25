-- DropForeignKey
ALTER TABLE "OralExamSession" DROP CONSTRAINT "OralExamSession_examId_fkey";

-- AddForeignKey
ALTER TABLE "OralExamSession" ADD CONSTRAINT "OralExamSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

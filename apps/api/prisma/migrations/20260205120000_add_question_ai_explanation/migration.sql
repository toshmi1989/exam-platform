-- CreateTable
CREATE TABLE "QuestionAIExplanation" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAIExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionAIExplanation_questionId_idx" ON "QuestionAIExplanation"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAIExplanation_questionId_lang_key" ON "QuestionAIExplanation"("questionId", "lang");

-- AddForeignKey
ALTER TABLE "QuestionAIExplanation" ADD CONSTRAINT "QuestionAIExplanation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

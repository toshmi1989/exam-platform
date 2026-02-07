-- Remove duplicate rows: keep one per questionId (smallest id)
DELETE FROM "QuestionAIExplanation" a
USING "QuestionAIExplanation" b
WHERE a."questionId" = b."questionId" AND a.id > b.id;

-- DropIndex
DROP INDEX "QuestionAIExplanation_questionId_lang_key";

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAIExplanation_questionId_key" ON "QuestionAIExplanation"("questionId");

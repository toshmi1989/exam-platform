-- CreateTable
CREATE TABLE "OralExamSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "score" INTEGER,
    "maxScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "OralExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OralExamAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "transcript" TEXT,
    "score" INTEGER,
    "detailedFeedback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OralExamAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OralExamSession_userId_status_idx" ON "OralExamSession"("userId", "status");

-- CreateIndex
CREATE INDEX "OralExamSession_examId_idx" ON "OralExamSession"("examId");

-- CreateIndex
CREATE INDEX "OralExamAnswer_sessionId_idx" ON "OralExamAnswer"("sessionId");

-- CreateIndex
CREATE INDEX "OralExamAnswer_questionId_idx" ON "OralExamAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "OralExamSession" ADD CONSTRAINT "OralExamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OralExamSession" ADD CONSTRAINT "OralExamSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OralExamAnswer" ADD CONSTRAINT "OralExamAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OralExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DirectionOralAnswer" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "answerHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectionOralAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectionOralAnswer_direction_language_promptHash_key" ON "DirectionOralAnswer"("direction", "language", "promptHash");

-- CreateIndex
CREATE INDEX "DirectionOralAnswer_direction_language_promptHash_idx" ON "DirectionOralAnswer"("direction", "language", "promptHash");

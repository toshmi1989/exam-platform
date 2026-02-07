-- CreateTable
CREATE TABLE "ZiyodaPrompt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ZiyodaPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZiyodaPrompt_key_key" ON "ZiyodaPrompt"("key");

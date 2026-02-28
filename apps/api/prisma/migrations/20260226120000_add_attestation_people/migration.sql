-- CreateTable
CREATE TABLE "attestation_people" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "full_name_normalized" TEXT NOT NULL,
    "specialty" TEXT,
    "region" TEXT,
    "stage" INTEGER NOT NULL,
    "profession" TEXT NOT NULL,
    "exam_date" TEXT,
    "exam_time" TEXT,
    "source_url" TEXT NOT NULL,
    "published_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attestation_people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_attestation_name" ON "attestation_people"("full_name_normalized");

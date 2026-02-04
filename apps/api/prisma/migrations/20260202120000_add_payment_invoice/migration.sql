-- CreateTable
CREATE TABLE "PaymentInvoice" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "examId" TEXT,
    "amountTiyin" INTEGER NOT NULL,
    "ps" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "mcUuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PaymentInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInvoice_invoiceId_key" ON "PaymentInvoice"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentInvoice_userId_idx" ON "PaymentInvoice"("userId");

-- CreateIndex
CREATE INDEX "PaymentInvoice_invoiceId_idx" ON "PaymentInvoice"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentInvoice_status_idx" ON "PaymentInvoice"("status");

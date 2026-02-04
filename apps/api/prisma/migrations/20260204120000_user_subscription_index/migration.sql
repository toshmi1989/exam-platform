-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_endsAt_idx" ON "UserSubscription"("userId", "status", "endsAt");

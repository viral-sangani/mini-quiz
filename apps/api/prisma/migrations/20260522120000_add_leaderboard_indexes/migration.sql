-- CreateIndex
CREATE INDEX "RoomPlayer_quizId_joinedAt_idx" ON "RoomPlayer"("quizId", "joinedAt");

-- CreateIndex
CREATE INDEX "Answer_userId_submittedAt_idx" ON "Answer"("userId", "submittedAt");

-- CreateIndex
CREATE INDEX "Answer_submittedAt_userId_idx" ON "Answer"("submittedAt", "userId");

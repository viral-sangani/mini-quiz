-- DropIndex
DROP INDEX "Answer_questionId_idx";

-- DropIndex
DROP INDEX "Answer_submittedAt_userId_idx";

-- DropIndex
DROP INDEX "Payout_status_idx";

-- DropIndex
DROP INDEX "PracticePlay_userId_idx";

-- DropIndex
DROP INDEX "PracticeQuestion_quizId_idx";

-- DropIndex
DROP INDEX "PracticeQuiz_published_idx";

-- DropIndex
DROP INDEX "Quiz_archivedAt_idx";

-- DropIndex
DROP INDEX "RoomPlayer_quizId_idx";

-- DropIndex
DROP INDEX "User_flagged_idx";

-- DropIndex
DROP INDEX "User_username_idx";

-- DropIndex
DROP INDEX "UserBadge_userId_idx";

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Answer_questionId_choiceId_idx" ON "Answer"("questionId", "choiceId");

-- CreateIndex
CREATE INDEX "Answer_quizId_isCorrect_idx" ON "Answer"("quizId", "isCorrect");

-- CreateIndex
CREATE INDEX "Payout_createdAt_rank_idx" ON "Payout"("createdAt" DESC, "rank");

-- CreateIndex
CREATE INDEX "Payout_status_createdAt_rank_idx" ON "Payout"("status", "createdAt" DESC, "rank");

-- CreateIndex
CREATE INDEX "Payout_status_updatedAt_idx" ON "Payout"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Payout_status_confirmedAt_idx" ON "Payout"("status", "confirmedAt");

-- CreateIndex
CREATE INDEX "Payout_quizId_createdAt_rank_idx" ON "Payout"("quizId", "createdAt" DESC, "rank");

-- CreateIndex
CREATE INDEX "Payout_quizId_status_rank_idx" ON "Payout"("quizId", "status", "rank");

-- CreateIndex
CREATE INDEX "Payout_userId_status_idx" ON "Payout"("userId", "status");

-- CreateIndex
CREATE INDEX "Payout_userId_rank_status_idx" ON "Payout"("userId", "rank", "status");

-- CreateIndex
CREATE INDEX "Payout_approvedById_idx" ON "Payout"("approvedById");

-- CreateIndex
CREATE INDEX "PracticePlay_userId_finishedAt_idx" ON "PracticePlay"("userId", "finishedAt");

-- CreateIndex
CREATE INDEX "PracticePlay_finishedAt_quizId_idx" ON "PracticePlay"("finishedAt", "quizId");

-- CreateIndex
CREATE INDEX "PracticeQuestion_quizId_createdAt_idx" ON "PracticeQuestion"("quizId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeQuiz_published_createdAt_idx" ON "PracticeQuiz"("published", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeQuiz_createdById_idx" ON "PracticeQuiz"("createdById");

-- CreateIndex
CREATE INDEX "Quiz_status_endedAt_idx" ON "Quiz"("status", "endedAt");

-- CreateIndex
CREATE INDEX "Quiz_kind_status_scheduledStart_idx" ON "Quiz"("kind", "status", "scheduledStart");

-- CreateIndex
CREATE INDEX "Quiz_kind_status_endedAt_idx" ON "Quiz"("kind", "status", "endedAt");

-- CreateIndex
CREATE INDEX "Quiz_kind_status_dailyDate_idx" ON "Quiz"("kind", "status", "dailyDate");

-- CreateIndex
CREATE INDEX "Quiz_kind_archivedAt_scheduledStart_createdAt_idx" ON "Quiz"("kind", "archivedAt", "scheduledStart", "createdAt");

-- CreateIndex
CREATE INDEX "Quiz_archivedAt_scheduledStart_idx" ON "Quiz"("archivedAt", "scheduledStart");

-- CreateIndex
CREATE INDEX "Quiz_archivedAt_startedAt_idx" ON "Quiz"("archivedAt", "startedAt");

-- CreateIndex
CREATE INDEX "Quiz_createdById_idx" ON "Quiz"("createdById");

-- CreateIndex
CREATE INDEX "RoomPlayer_userId_idx" ON "RoomPlayer"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "User_flagged_deletedAt_idx" ON "User"("flagged", "deletedAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_totalXp_idx" ON "User"("deletedAt", "totalXp");

-- CreateIndex
CREATE INDEX "User_deletedAt_role_createdAt_idx" ON "User"("deletedAt", "role", "createdAt");

-- CreateIndex
CREATE INDEX "User_flaggedById_idx" ON "User"("flaggedById");

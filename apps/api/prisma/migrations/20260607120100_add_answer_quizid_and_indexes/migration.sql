-- AlterTable Answer: add denormalized quizId so per-quiz answer aggregations
-- (leaderboards, periodic boards) avoid a join/scan through Question.

-- 1. Add the column nullable first so existing rows can be backfilled.
ALTER TABLE "Answer" ADD COLUMN "quizId" TEXT;

-- 2. Backfill quizId from the owning Question.
UPDATE "Answer" AS a
SET "quizId" = q."quizId"
FROM "Question" AS q
WHERE a."questionId" = q."id";

-- 3. Now that every row is populated, enforce NOT NULL.
ALTER TABLE "Answer" ALTER COLUMN "quizId" SET NOT NULL;

-- 4. Foreign key to Quiz (Cascade matches Answer.roomPlayer cascade behavior).
ALTER TABLE "Answer"
  ADD CONSTRAINT "Answer_quizId_fkey"
  FOREIGN KEY ("quizId") REFERENCES "Quiz"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Index for per-quiz, time-ordered answer scans.
CREATE INDEX "Answer_quizId_submittedAt_idx" ON "Answer"("quizId", "submittedAt");

-- 6. Covering index for periodic (windowed) leaderboards: filter by submittedAt
-- range, group by userId, sum points without touching the heap.
CREATE INDEX "Answer_submittedAt_userId_points_idx" ON "Answer"("submittedAt", "userId", "points");

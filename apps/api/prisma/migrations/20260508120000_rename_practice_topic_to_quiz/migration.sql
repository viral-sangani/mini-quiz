-- Rename PracticeTopic → PracticeQuiz across the data model. The user-facing
-- "topic" terminology was always confusing (people associated it with a
-- subject taxonomy); a "practice quiz" is more self-describing.
--
-- This migration is a pure rename: tables, columns, indexes, foreign keys,
-- and the unique constraints. No data shape changes. Existing rows survive.

-- 1. Tables
ALTER TABLE "PracticeTopic" RENAME TO "PracticeQuiz";

-- 2. Column rename: topicId → quizId on the two child tables.
ALTER TABLE "PracticeQuestion" RENAME COLUMN "topicId" TO "quizId";
ALTER TABLE "PracticePlay"     RENAME COLUMN "topicId" TO "quizId";

-- 3. Indexes — Postgres keeps the index names that Prisma generated under
--    the old table/column names. Rename them so future Prisma diffs don't
--    see them as drift.
ALTER INDEX "PracticeTopic_pkey"               RENAME TO "PracticeQuiz_pkey";
ALTER INDEX "PracticeTopic_slug_key"           RENAME TO "PracticeQuiz_slug_key";
ALTER INDEX "PracticeTopic_published_idx"      RENAME TO "PracticeQuiz_published_idx";
ALTER INDEX "PracticeQuestion_topicId_idx"     RENAME TO "PracticeQuestion_quizId_idx";
ALTER INDEX "PracticePlay_topicId_userId_idx"  RENAME TO "PracticePlay_quizId_userId_idx";

-- 4. Foreign key constraints. Names are what Prisma generated.
ALTER TABLE "PracticeQuiz"
  RENAME CONSTRAINT "PracticeTopic_createdById_fkey" TO "PracticeQuiz_createdById_fkey";

ALTER TABLE "PracticeQuestion"
  RENAME CONSTRAINT "PracticeQuestion_topicId_fkey" TO "PracticeQuestion_quizId_fkey";

ALTER TABLE "PracticePlay"
  RENAME CONSTRAINT "PracticePlay_topicId_fkey" TO "PracticePlay_quizId_fkey";

-- CreateEnum QuizKind: LIVE = original prize quizzes; DAILY = async 24h
-- async daily quiz. Discriminator on Quiz so Question/Answer/RoomPlayer can
-- be reused for both.
CREATE TYPE "QuizKind" AS ENUM ('LIVE', 'DAILY');

-- AlterTable User: streak fields for daily quiz.
ALTER TABLE "User"
  ADD COLUMN "currentStreak"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "longestStreak"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastDailyPlayedAt" TIMESTAMP(3);

-- AlterTable Quiz: kind discriminator + dailyDate (UTC date the daily quiz
-- is active). Existing rows default to LIVE so live quizzes are unaffected.
ALTER TABLE "Quiz"
  ADD COLUMN "kind"      "QuizKind" NOT NULL DEFAULT 'LIVE',
  ADD COLUMN "dailyDate" DATE;

-- At most one DAILY quiz per UTC date. NULL dailyDate is allowed for LIVE
-- rows; multiple LIVE rows with NULL dailyDate is fine because Postgres
-- treats NULLs as distinct in unique constraints.
CREATE UNIQUE INDEX "Quiz_kind_dailyDate_key" ON "Quiz"("kind", "dailyDate");

-- AlterTable RoomPlayer: per-play state for daily quizzes (session timer
-- start + Fisher-Yates-shuffled question order). NULL for live rooms.
ALTER TABLE "RoomPlayer"
  ADD COLUMN "dailyStartedAt"     TIMESTAMP(3),
  ADD COLUMN "dailyQuestionOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable PracticeTopic: solo-learning topics. ~4-5 active at a time;
-- admin updates the question pool every few days (often with AI assist).
CREATE TABLE "PracticeTopic" (
    "id"          TEXT NOT NULL,
    "slug"        TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "iconName"    TEXT NOT NULL DEFAULT 'book',
    "coverColor"  TEXT NOT NULL DEFAULT 'primary',
    "published"   BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeTopic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PracticeTopic_slug_key" ON "PracticeTopic"("slug");
CREATE INDEX "PracticeTopic_published_idx" ON "PracticeTopic"("published");

ALTER TABLE "PracticeTopic"
  ADD CONSTRAINT "PracticeTopic_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable PracticeQuestion: mutable pool. Cascade-deleted with the topic.
-- choices = JSON [{id, label}, ...] same shape as Question.choices.
CREATE TABLE "PracticeQuestion" (
    "id"              TEXT NOT NULL,
    "topicId"         TEXT NOT NULL,
    "prompt"          TEXT NOT NULL,
    "choices"         JSONB NOT NULL,
    "correctChoiceId" TEXT NOT NULL,
    "explanation"     TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PracticeQuestion_topicId_idx" ON "PracticeQuestion"("topicId");

ALTER TABLE "PracticeQuestion"
  ADD CONSTRAINT "PracticeQuestion_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "PracticeTopic"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable PracticePlay: one row per (user, topic, session). Used for
-- head count + badge thresholds. No leaderboard reads off this.
CREATE TABLE "PracticePlay" (
    "id"           TEXT NOT NULL,
    "topicId"      TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"   TIMESTAMP(3),
    "questionIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scoreCorrect" INTEGER NOT NULL DEFAULT 0,
    "scoreTotal"   INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PracticePlay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PracticePlay_topicId_userId_idx" ON "PracticePlay"("topicId", "userId");
CREATE INDEX "PracticePlay_userId_idx" ON "PracticePlay"("userId");

ALTER TABLE "PracticePlay"
  ADD CONSTRAINT "PracticePlay_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "PracticeTopic"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticePlay"
  ADD CONSTRAINT "PracticePlay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable DailyLeaderboardSnapshot: frozen leaderboard per UTC date.
-- Written by the scheduler when a DAILY transitions LIVE -> ENDED. quizId
-- and date are both unique so we never double-snapshot a quiz.
CREATE TABLE "DailyLeaderboardSnapshot" (
    "id"           TEXT NOT NULL,
    "date"         DATE NOT NULL,
    "quizId"       TEXT NOT NULL,
    "rows"         JSONB NOT NULL,
    "winnerUserId" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyLeaderboardSnapshot_date_key" ON "DailyLeaderboardSnapshot"("date");
CREATE UNIQUE INDEX "DailyLeaderboardSnapshot_quizId_key" ON "DailyLeaderboardSnapshot"("quizId");
CREATE INDEX "DailyLeaderboardSnapshot_winnerUserId_idx" ON "DailyLeaderboardSnapshot"("winnerUserId");

ALTER TABLE "DailyLeaderboardSnapshot"
  ADD CONSTRAINT "DailyLeaderboardSnapshot_quizId_fkey"
  FOREIGN KEY ("quizId") REFERENCES "Quiz"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

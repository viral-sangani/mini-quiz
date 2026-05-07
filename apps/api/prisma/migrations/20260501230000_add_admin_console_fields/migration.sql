-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- AlterTable User: add moderation flag fields
ALTER TABLE "User"
  ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "flagReason" TEXT,
  ADD COLUMN "flaggedAt" TIMESTAMP(3),
  ADD COLUMN "flaggedById" TEXT;

-- AlterTable Quiz: add difficulty + coverColor
ALTER TABLE "Quiz"
  ADD COLUMN "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "coverColor" TEXT NOT NULL DEFAULT 'primary';

-- CreateIndex
CREATE INDEX "User_flagged_idx" ON "User"("flagged");

-- AddForeignKey
ALTER TABLE "User"
  ADD CONSTRAINT "User_flaggedById_fkey"
  FOREIGN KEY ("flaggedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

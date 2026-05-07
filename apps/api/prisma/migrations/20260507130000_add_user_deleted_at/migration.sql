-- AlterTable User: add soft-delete timestamp
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Partial index: most reads filter `deletedAt IS NULL`, so a partial index
-- on the active subset is more useful than indexing every row.
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt") WHERE "deletedAt" IS NOT NULL;

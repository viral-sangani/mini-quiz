-- AlterTable: add player profile fields to User
ALTER TABLE "User"
  ADD COLUMN "username"     TEXT,
  ADD COLUMN "avatarEmoji"  TEXT,
  ADD COLUMN "avatarColor"  TEXT,
  ADD COLUMN "totalXp"      INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: unique username (nullable)
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateTable: UserBadge
CREATE TABLE "UserBadge" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "badgeId"   TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");

-- AddForeignKey
ALTER TABLE "UserBadge"
  ADD CONSTRAINT "UserBadge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

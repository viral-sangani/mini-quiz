-- CreateTable AdminCredential: 1:1 with User. PK is userId itself.
CREATE TABLE "AdminCredential" (
    "userId"            TEXT NOT NULL,
    "passwordHash"      TEXT NOT NULL,
    "passwordUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt"       TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminCredential_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey: cascade delete so revoking an admin (User row delete) cleans
-- up credentials. In practice we don't delete User rows; admin revoke just
-- deletes the AdminCredential and flips role back to USER.
ALTER TABLE "AdminCredential"
  ADD CONSTRAINT "AdminCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

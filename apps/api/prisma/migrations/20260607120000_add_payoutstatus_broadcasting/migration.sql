-- AlterEnum PayoutStatus: add BROADCASTING, the state a payout occupies once a
-- signer has atomically claimed it for signing (between APPROVED and BROADCAST).
--
-- IMPORTANT: this migration MUST be applied standalone. Postgres does not allow
-- ALTER TYPE ... ADD VALUE to run inside a transaction block, and Prisma wraps
-- each migration in a transaction. Keep this file to exactly this one statement
-- with no other DDL so it can be applied on its own.
ALTER TYPE "PayoutStatus" ADD VALUE 'BROADCASTING';

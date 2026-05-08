-- CreateEnum PayoutToken: native CELO + the two stablecoins we currently
-- support on Celo mainnet. The payout broadcaster picks transfer path
-- (native sendTransaction vs ERC-20 transfer) by symbol.
CREATE TYPE "PayoutToken" AS ENUM ('CELO', 'USDC', 'USDT');

-- AlterTable Quiz: pick the prize token per quiz. Default USDT preserves
-- pre-multi-token behavior on every existing row, so the auto-disburse
-- pipeline keeps working without admin intervention.
ALTER TABLE "Quiz"
  ADD COLUMN "payoutToken" "PayoutToken" NOT NULL DEFAULT 'USDT';

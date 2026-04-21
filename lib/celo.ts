import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";

export const publicCeloClient = createPublicClient({
  chain: celo,
  transport: http("https://forno.celo.org"),
});

// Prize token: USDT on Celo mainnet — 6 decimals.
// For gas we must pass the fee-currency adapter, NOT the token address —
// USDT transactions fail if feeCurrency is set to the token address.
export const PRIZE_TOKEN_ADDRESS = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const;
export const PRIZE_TOKEN_DECIMALS = 6;
export const PRIZE_TOKEN_SYMBOL = "USDT";
export const PRIZE_FEE_CURRENCY_ADDRESS = "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72" as const;

export const BLOCKSCOUT_TX = (hash: string) => `https://celo.blockscout.com/tx/${hash}`;

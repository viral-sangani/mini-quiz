// Prize token: USDT on Celo mainnet (6 decimals).
// For gas we pass the fee-currency ADAPTER, not the token address —
// USDT transactions revert if feeCurrency points at the token itself.
export const PRIZE_TOKEN_ADDRESS = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const;
export const PRIZE_TOKEN_DECIMALS = 6 as const;
export const PRIZE_TOKEN_SYMBOL = "USDT" as const;
export const PRIZE_FEE_CURRENCY_ADDRESS = "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72" as const;

export const CELO_CHAIN_ID = 42220 as const;

export const BLOCKSCOUT_TX = (hash: string): string =>
  `https://celo.blockscout.com/tx/${hash}`;

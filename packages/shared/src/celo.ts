// Celo network constants + payout token catalog. Single source of truth
// for both the api (chain transfers, balance reads) and the admin UI
// (token picker, treasury card, deposit panel).

export const CELO_CHAIN_ID = 42220 as const;

export const BLOCKSCOUT_TX = (hash: string): string =>
  `https://celo.blockscout.com/tx/${hash}`;

export const BLOCKSCOUT_ADDRESS = (addr: string): string =>
  `https://celo.blockscout.com/address/${addr}`;

// ---------------------------------------------------------------------------
// Payout token catalog
// ---------------------------------------------------------------------------
//
// All tokens supported as prizes. CELO is the native chain asset; USDC and
// USDT are ERC-20 stablecoins on Celo mainnet. `feeCurrencyAddress` is the
// CIP-64 fee-currency adapter when we intentionally want to pay gas in that
// token. Mini Quiz prize payouts currently omit feeCurrency so gas is paid in
// CELO and a "just enough" stablecoin balance can still be paid out exactly.

export type PayoutTokenSymbol = "CELO" | "USDC" | "USDT";

export type PayoutTokenSpec = {
  symbol: PayoutTokenSymbol;
  /** ERC-20 contract address. Null for native CELO. */
  address: `0x${string}` | null;
  decimals: number;
  /**
   * Fee-currency adapter for CIP-64 transactions. Null when paying gas in
   * native CELO (i.e. when the token IS CELO).
   */
  feeCurrencyAddress: `0x${string}` | null;
  isNative: boolean;
  label: string;
};

export const PAYOUT_TOKENS: readonly PayoutTokenSpec[] = [
  {
    symbol: "CELO",
    address: null,
    decimals: 18,
    feeCurrencyAddress: null,
    isNative: true,
    label: "CELO",
  },
  {
    symbol: "USDC",
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    // USDC fee-currency adapter on Celo mainnet.
    feeCurrencyAddress: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    isNative: false,
    label: "USDC",
  },
  {
    symbol: "USDT",
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    // USDT fee-currency adapter on Celo mainnet.
    feeCurrencyAddress: "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72",
    isNative: false,
    label: "USDT",
  },
] as const;

export function getPayoutToken(symbol: PayoutTokenSymbol): PayoutTokenSpec {
  const t = PAYOUT_TOKENS.find((x) => x.symbol === symbol);
  if (!t) throw new Error(`Unknown payout token: ${symbol}`);
  return t;
}

export function getPayoutTokenByAddress(
  address: string | null | undefined,
): PayoutTokenSpec | null {
  if (address == null) {
    return null;
  }
  const lower = address.toLowerCase();
  if (lower === "celo" || lower === "") {
    // Payout rows for native CELO store an empty/"CELO" sentinel; both
    // resolve here to the native token.
    return PAYOUT_TOKENS.find((t) => t.isNative) ?? null;
  }
  return (
    PAYOUT_TOKENS.find(
      (t) => t.address && t.address.toLowerCase() === lower,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Legacy aliases — kept so older imports don't break during the rollout.
// New code should use PAYOUT_TOKENS / getPayoutToken instead.
// ---------------------------------------------------------------------------
const _USDT = getPayoutToken("USDT");
export const PRIZE_TOKEN_ADDRESS = _USDT.address!;
export const PRIZE_TOKEN_DECIMALS = _USDT.decimals;
export const PRIZE_TOKEN_SYMBOL = _USDT.symbol;
export const PRIZE_FEE_CURRENCY_ADDRESS = _USDT.feeCurrencyAddress!;

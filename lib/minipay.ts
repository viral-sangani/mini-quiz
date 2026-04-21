"use client";

import {
  createWalletClient,
  custom,
  encodeFunctionData,
  parseUnits,
  type WalletClient,
  type EIP1193Provider,
} from "viem";
import { celo } from "viem/chains";
import {
  PRIZE_TOKEN_ADDRESS,
  PRIZE_TOKEN_DECIMALS,
  PRIZE_FEE_CURRENCY_ADDRESS,
} from "./celo";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { isMiniPay?: boolean };
  }
}

export function isMiniPay(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.ethereum &&
    (window.ethereum as { isMiniPay?: boolean }).isMiniPay === true
  );
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectAddress(): Promise<`0x${string}` | null> {
  if (!hasInjectedWallet()) return null;
  const client = createWalletClient({ chain: celo, transport: custom(window.ethereum!) });
  try {
    const [address] = await client.getAddresses();
    if (address) return address;
  } catch {
    // fall through
  }
  try {
    const [address] = (await window.ethereum!.request({
      method: "eth_requestAccounts",
    })) as `0x${string}`[];
    return address ?? null;
  } catch {
    return null;
  }
}

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export async function sendUsdmPrize(
  to: `0x${string}`,
  amount: string
): Promise<`0x${string}`> {
  if (!hasInjectedWallet()) throw new Error("No wallet available");
  const client: WalletClient = createWalletClient({
    chain: celo,
    transport: custom(window.ethereum!),
  });
  const [from] = await client.getAddresses();
  if (!from) throw new Error("No account connected");

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [to, parseUnits(amount, PRIZE_TOKEN_DECIMALS)],
  });

  const tx = await client.sendTransaction({
    account: from,
    chain: celo,
    to: PRIZE_TOKEN_ADDRESS,
    data,
    // MiniPay fee abstraction: pay gas in the prize token. USDT requires
    // the fee-currency adapter, not the token address itself.
    feeCurrency: PRIZE_FEE_CURRENCY_ADDRESS,
  } as Parameters<typeof client.sendTransaction>[0]);

  return tx;
}

"use client";

import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { celo } from "viem/chains";

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

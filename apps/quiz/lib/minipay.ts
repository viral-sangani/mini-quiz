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
  if (!isMiniPay() || !window.ethereum) return null;
  const provider: EIP1193Provider = window.ethereum;
  const client = createWalletClient({ chain: celo, transport: custom(provider) });
  try {
    const [address] = await client.getAddresses();
    return address ?? null;
  } catch {
    return null;
  }
}

export async function signWalletMessage(
  address: `0x${string}`,
  message: string,
): Promise<`0x${string}`> {
  if (!isMiniPay() || !window.ethereum) {
    throw new Error("MiniPay wallet is not connected");
  }
  const provider: EIP1193Provider = window.ethereum;
  const client = createWalletClient({ chain: celo, transport: custom(provider) });
  return client.signMessage({ account: address, message });
}

"use client";

import { api } from "./api-client";
import { signWalletMessage } from "./minipay";

type NonceResponse = {
  address: string;
  nonce: string;
  message: string;
  expiresInSeconds: number;
};

type VerifyResponse = {
  token: string;
  address: string;
  expiresInSeconds: number;
};

type StoredWalletSession = {
  address: string;
  token: string;
  expiresAt: number;
};

const STORAGE_KEY = "mini-quiz:wallet-session:v1";
const EXPIRY_SKEW_MS = 60_000;

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function readStoredSession(address: `0x${string}`): StoredWalletSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWalletSession>;
    if (
      typeof parsed.address !== "string" ||
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    if (normalizeAddress(parsed.address) !== normalizeAddress(address)) return null;
    if (parsed.expiresAt <= Date.now() + EXPIRY_SKEW_MS) return null;
    return {
      address: parsed.address,
      token: parsed.token,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredWalletSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in constrained webviews; keep the in-flight
    // token usable for this request and ask again next time.
  }
}

export function clearWalletSession(address?: `0x${string}`): void {
  if (typeof window === "undefined") return;
  if (!address) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const stored = readStoredSession(address);
  if (stored) window.localStorage.removeItem(STORAGE_KEY);
}

export async function getWalletSessionToken(
  address: `0x${string}`,
): Promise<string> {
  const stored = readStoredSession(address);
  if (stored) return stored.token;

  const nonce = await api.post<NonceResponse>("/auth/wallet/nonce", {
    walletAddress: address,
  });

  let signature: `0x${string}`;
  try {
    signature = await signWalletMessage(address, nonce.message);
  } catch {
    throw new Error("Please approve the MiniPay wallet sign-in request to continue.");
  }

  const verified = await api.post<VerifyResponse>("/auth/wallet/verify", {
    walletAddress: address,
    signature,
  });

  writeStoredSession({
    address: normalizeAddress(verified.address),
    token: verified.token,
    expiresAt: Date.now() + verified.expiresInSeconds * 1000,
  });

  return verified.token;
}

"use client";

import { api } from "./api-client";

// Client-side admin API client. Requests a short-lived HS256 bearer token
// from /api/auth/token (which reads the NextAuth session) and forwards it to
// the Fastify backend.
//
// Caches the token for 9 minutes (tokens are 10m TTL) to avoid one extra
// round-trip per call.

type TokenCache = { token: string; exp: number } | null;
let cache: TokenCache = null;

async function getToken(): Promise<string> {
  if (cache && cache.exp > Date.now() + 30_000) return cache.token;
  const res = await fetch("/api/auth/token", { credentials: "include" });
  if (!res.ok) throw new Error(`Could not mint admin token (${res.status})`);
  const data = (await res.json()) as { token: string };
  cache = { token: data.token, exp: Date.now() + 9 * 60_000 };
  return data.token;
}

export const adminApi = {
  get: async <T,>(path: string) => api.get<T>(path, { token: await getToken() }),
  post: async <T,>(path: string, body?: unknown) =>
    api.post<T>(path, body, { token: await getToken() }),
  patch: async <T,>(path: string, body?: unknown) =>
    api.patch<T>(path, body, { token: await getToken() }),
  del: async <T,>(path: string) => api.del<T>(path, { token: await getToken() }),
};

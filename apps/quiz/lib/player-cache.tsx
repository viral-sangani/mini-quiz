"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// In-memory stale-while-revalidate cache for read-mostly tab data.
//
// Why this and not TanStack Query / SWR: those would solve the same problem
// but at the cost of a new dep + a real cache lifecycle to learn. Our needs
// are tiny — a Map keyed by string, a "last fetched at" timestamp, a hook
// that returns cached data immediately and revalidates in the background.
// ~80 lines of code, no dep, no surprise re-renders.
//
// Pattern:
//   const { data, isLoading, error, refetch } = usePlayerCache(
//     `daily-today:${wallet ?? "anon"}`,
//     () => api.get<...>("/daily/today?...").then(...),
//     { staleAfterMs: 60_000 },
//   );
//
// On first call: data is null, isLoading is true, fetcher runs.
// On subsequent calls (e.g., tab re-enter): data is the cached payload
// (rendered immediately, no flicker). If the entry is older than
// staleAfterMs, a background refetch fires; while it's in flight, isLoading
// stays false (we have data already) — caller can read isStale if they want
// to show a subtle indicator.

type Entry<T> = {
  data: T;
  fetchedAt: number;
};

type CacheStore = Map<string, Entry<unknown>>;

type Listeners = Map<string, Set<() => void>>;

type Ctx = {
  // Returns the current entry (or undefined). Pure read.
  read: <T>(key: string) => Entry<T> | undefined;
  // Writes a fresh entry and notifies subscribers.
  write: <T>(key: string, data: T) => void;
  // Drops a key (e.g. on logout / wallet change).
  invalidate: (keyOrPrefix: string) => void;
  // Subscribe a re-render to a specific key.
  subscribe: (key: string, fn: () => void) => () => void;
};

const PlayerCacheContext = createContext<Ctx | null>(null);

export function PlayerCacheProvider({ children }: { children: ReactNode }) {
  // Refs so writes never trigger re-renders of the Provider — only
  // subscribed consumers re-render.
  const storeRef = useRef<CacheStore>(new Map());
  const listenersRef = useRef<Listeners>(new Map());

  const read = useCallback(<T,>(key: string) => {
    return storeRef.current.get(key) as Entry<T> | undefined;
  }, []);

  const notify = useCallback((key: string) => {
    const set = listenersRef.current.get(key);
    if (!set) return;
    for (const fn of set) {
      try {
        fn();
      } catch {
        // a listener that throws shouldn't kill the others
      }
    }
  }, []);

  const write = useCallback(
    <T,>(key: string, data: T) => {
      storeRef.current.set(key, { data, fetchedAt: Date.now() });
      notify(key);
    },
    [notify],
  );

  const invalidate = useCallback(
    (keyOrPrefix: string) => {
      // Treat trailing ":" as a prefix marker, so callers can flush a
      // family of keys (e.g. invalidate("leaderboard:") drops every
      // period). Plain keys still match exactly.
      if (keyOrPrefix.endsWith(":")) {
        for (const k of Array.from(storeRef.current.keys())) {
          if (k.startsWith(keyOrPrefix)) {
            storeRef.current.delete(k);
            notify(k);
          }
        }
        return;
      }
      if (storeRef.current.delete(keyOrPrefix)) notify(keyOrPrefix);
    },
    [notify],
  );

  const subscribe = useCallback((key: string, fn: () => void) => {
    let set = listenersRef.current.get(key);
    if (!set) {
      set = new Set();
      listenersRef.current.set(key, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set?.size === 0) listenersRef.current.delete(key);
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({ read, write, invalidate, subscribe }),
    [read, write, invalidate, subscribe],
  );

  return (
    <PlayerCacheContext.Provider value={value}>
      {children}
    </PlayerCacheContext.Provider>
  );
}

function useCache(): Ctx {
  const ctx = useContext(PlayerCacheContext);
  if (!ctx)
    throw new Error("usePlayerCache must be used inside PlayerCacheProvider");
  return ctx;
}

export type UsePlayerCacheResult<T> = {
  data: T | null;
  isLoading: boolean; // true only when there's no cached data yet
  isStale: boolean; // true when cached data exists but is older than staleAfterMs
  error: Error | null;
  refetch: () => Promise<void>;
};

export type UsePlayerCacheOptions = {
  // Older than this → mark stale + revalidate in background. Default 30s.
  staleAfterMs?: number;
  // If true, skip the fetch entirely (e.g. waiting for wallet). Returns
  // {data: cached?.data ?? null, isLoading: false}.
  enabled?: boolean;
};

export function usePlayerCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: UsePlayerCacheOptions = {},
): UsePlayerCacheResult<T> {
  const { staleAfterMs = 30_000, enabled = true } = opts;
  const cache = useCache();
  // Pin fetcher in a ref so changing closures don't re-trigger fetches.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // Subscribe-driven re-renders. We bump this counter from the cache
  // listener whenever our key changes.
  const [, setTick] = useState(0);
  // Per-hook error state.
  const [error, setError] = useState<Error | null>(null);
  // Tracks an in-flight revalidate so we don't fire two for the same
  // key from one tab.
  const inFlightRef = useRef<Promise<void> | null>(null);

  // Subscribe to cache notifications for this key.
  useEffect(() => {
    const unsub = cache.subscribe(key, () => setTick((n) => n + 1));
    return unsub;
  }, [cache, key]);

  const entry = cache.read<T>(key);
  const data = entry?.data ?? null;
  const fetchedAt = entry?.fetchedAt ?? 0;
  const isStale = entry ? Date.now() - fetchedAt > staleAfterMs : true;
  const isLoading = !entry && enabled;

  const doFetch = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;
    const p = (async () => {
      try {
        const fresh = await fetcherRef.current();
        cache.write<T>(key, fresh);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = p;
    return p;
  }, [cache, key]);

  // Initial-load + stale-revalidate. Runs when key changes, when enabled
  // flips on, or when the entry transitions stale.
  useEffect(() => {
    if (!enabled) return;
    if (!entry || isStale) {
      void doFetch();
    }
    // We deliberately don't include `entry` / `isStale` in deps to avoid a
    // refetch loop — the subscribe-tick is what wakes us up after a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, doFetch]);

  return {
    data,
    isLoading,
    isStale,
    error,
    refetch: doFetch,
  };
}

// Convenience hook for reading the cache imperatively (e.g. to invalidate
// after a mutation).
export function useCacheControls() {
  const cache = useCache();
  return useMemo(
    () => ({ invalidate: cache.invalidate, write: cache.write }),
    [cache],
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CheckUsernameResult, MyProfile, PublicUser } from "@mini-quiz/shared";
import { ApiError, api } from "./api-client";
import { connectAddress, isMiniPay } from "./minipay";
import { clearWalletSession, getWalletSessionToken } from "./wallet-session";

// Possible states the player app can be in. Pages branch off this:
//
// "loading"       — boot, deciding what to do
// "no-wallet"     — no injected provider; show MiniPayGate
// "needs-onboarding" — wallet detected, but profile is missing fields
// "ready"         — wallet + complete profile; route to onboarded shell

export type AuthState =
  | { status: "loading" }
  | { status: "no-wallet" }
  | {
      status: "profile-error";
      walletAddress: `0x${string}`;
      message: string;
    }
  | {
      status: "needs-onboarding";
      walletAddress: `0x${string}`;
      user: PublicUser & { walletAddress: string };
      profile: MyProfile;
    }
  | {
      status: "ready";
      walletAddress: `0x${string}`;
      user: PublicUser & { walletAddress: string };
      profile: MyProfile;
    };

type Ctx = {
  state: AuthState;
  refresh: () => Promise<void>;
  // Saves the new profile + locally re-runs `getOrCreatePlayerByWallet` to
  // pick up `needsOnboarding`. Returns the latest server view so the caller
  // can decide what to do next (e.g. redirect to home after onboarding).
  saveProfile: (input: {
    displayName?: string;
    username?: string;
    avatarEmoji?: string;
    avatarColor?: string;
  }) => Promise<MyProfile>;
  checkUsername: (value: string) => Promise<CheckUsernameResult>;
};

const ProfileContext = createContext<Ctx | null>(null);

type MeResponse = {
  user: PublicUser & { walletAddress: string };
  profile: MyProfile;
  needsOnboarding: boolean;
};

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // Re-fetch /users/me from the wallet currently in state. Used by saveProfile
  // and any page that wants to refresh after a server-side change.
  const refreshFromWallet = useCallback(async (addr: `0x${string}`) => {
    const me = await api.get<MeResponse>(
      `/users/me?walletAddress=${addr}`,
    );
    setState({
      status: me.needsOnboarding ? "needs-onboarding" : "ready",
      walletAddress: addr,
      user: me.user,
      profile: me.profile,
    });
  }, []);

  const refresh = useCallback(async () => {
    if (state.status === "ready" || state.status === "needs-onboarding") {
      await refreshFromWallet(state.walletAddress);
      return;
    }
    // Re-run the full boot.
    await boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, refreshFromWallet]);

  const saveProfile: Ctx["saveProfile"] = useCallback(
    async (input) => {
      if (state.status !== "ready" && state.status !== "needs-onboarding") {
        throw new Error("Cannot save profile before wallet is connected");
      }
      const saveWithToken = async (token: string) =>
        api.patch<{ profile: MyProfile }>(
          `/users/me`,
          input,
          { token },
        );
      let token = await getWalletSessionToken(state.walletAddress);
      let res: { profile: MyProfile };
      try {
        res = await saveWithToken(token);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401) throw e;
        clearWalletSession(state.walletAddress);
        token = await getWalletSessionToken(state.walletAddress);
        res = await saveWithToken(token);
      }
      await refreshFromWallet(state.walletAddress);
      return res.profile;
    },
    [state, refreshFromWallet],
  );

  const checkUsername: Ctx["checkUsername"] = useCallback(async (value) => {
    return api.get<CheckUsernameResult>(
      `/users/check-username?value=${encodeURIComponent(value)}`,
    );
  }, []);

  const boot = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!isMiniPay()) {
      setState({ status: "no-wallet" });
      return;
    }
    try {
      const addr = await connectAddress();
      if (!addr) {
        setState({ status: "no-wallet" });
        return;
      }
      try {
        await refreshFromWallet(addr as `0x${string}`);
      } catch (error) {
        setState({
          status: "profile-error",
          walletAddress: addr as `0x${string}`,
          message:
            error instanceof Error
              ? error.message
              : "Could not load your Mini Quiz profile.",
        });
      }
    } catch {
      setState({ status: "no-wallet" });
    }
  }, [refreshFromWallet]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const value = useMemo<Ctx>(
    () => ({ state, refresh, saveProfile, checkUsername }),
    [state, refresh, saveProfile, checkUsername],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): Ctx {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}

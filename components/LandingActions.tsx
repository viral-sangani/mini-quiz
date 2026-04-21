"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BigButton } from "@/components/BigButton";
import { connectAddress, hasInjectedWallet } from "@/lib/minipay";
import { isHostAddress } from "@/lib/host";

export function LandingActions() {
  const [canHost, setCanHost] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasInjectedWallet()) {
        if (!cancelled) setChecking(false);
        return;
      }
      const addr = await connectAddress();
      if (cancelled) return;
      setCanHost(isHostAddress(addr));
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex w-full max-w-sm flex-col items-stretch gap-4 pt-4 sm:flex-row sm:justify-center">
      {canHost && (
        <Link href="/host" className="flex-1">
          <BigButton variant="green" size="xl" className="w-full">
            I&apos;m Hosting
          </BigButton>
        </Link>
      )}
      <Link href="/join" className={canHost ? "flex-1" : "w-full"}>
        <BigButton variant="yellow" size="xl" className="w-full">
          {checking ? "Loading…" : "Join a Room"}
        </BigButton>
      </Link>
    </div>
  );
}

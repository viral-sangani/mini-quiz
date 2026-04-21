"use client";

import { useState } from "react";
import { BigButton } from "./BigButton";
import { publicCeloClient, BLOCKSCOUT_TX } from "@/lib/celo";
import { sendUsdmPrize } from "@/lib/minipay";

type Status = "idle" | "sending" | "pending" | "confirmed";

export function PayoutButton({
  roomId,
  rank,
  playerId,
  toAddress,
  amount,
}: {
  roomId: string;
  rank: 1 | 2 | 3;
  playerId: string;
  toAddress: string | null;
  amount: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const disabled = !toAddress || status !== "idle";

  async function postPayout(hash: `0x${string}`, confirmed: boolean) {
    await fetch(`/api/rooms/${roomId}/payout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        rank,
        amount,
        txHash: hash,
        confirmed,
      }),
    });
  }

  async function handleClick() {
    if (!toAddress) return;
    setError(null);
    setStatus("sending");
    try {
      const hash = await sendUsdmPrize(toAddress as `0x${string}`, amount);
      setTxHash(hash);
      await postPayout(hash, false);
      setStatus("pending");

      await publicCeloClient.waitForTransactionReceipt({ hash });
      await postPayout(hash, true);
      setStatus("confirmed");
    } catch (err) {
      setStatus("idle");
      setTxHash(null);
      setError(err instanceof Error ? err.message : "Payout failed");
    }
  }

  const label =
    status === "sending"
      ? "Signing…"
      : status === "pending"
      ? "Pending…"
      : status === "confirmed"
      ? "💸 Sent!"
      : `Send ${amount} USDT`;

  return (
    <div className="flex flex-col items-stretch gap-1">
      <div className="group relative">
        <BigButton
          variant="green"
          size="lg"
          onClick={handleClick}
          disabled={disabled}
          className="w-full"
        >
          {label}
        </BigButton>
        {!toAddress && (
          <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-duo-ink px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-3d-sm transition-opacity group-hover:opacity-100">
            no wallet address
          </span>
        )}
      </div>

      {txHash && (
        <a
          href={BLOCKSCOUT_TX(txHash)}
          target="_blank"
          rel="noreferrer"
          className="self-center text-xs font-semibold text-duo-blue underline"
        >
          View on Blockscout
        </a>
      )}

      {error && (
        <div className="text-center text-xs font-semibold text-duo-red">
          {error}
        </div>
      )}
    </div>
  );
}

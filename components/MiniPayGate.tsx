"use client";

import { useState } from "react";
import { BigButton } from "./BigButton";
import { Mascot } from "./Mascot";

const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.opera.minipay";
const IOS_URL =
  "https://apps.apple.com/de/app/minipay-easy-global-wallet/id6504087257";

export function MiniPayGate({ targetUrl }: { targetUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // noop
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-duo-cream p-4">
      <div className="w-full max-w-md rounded-3xl border-2 border-duo-gray-light bg-white p-6 shadow-3d-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <Mascot mood="happy" size={96} />
          <h1 className="font-display text-3xl font-black text-duo-ink">
            Open this in MiniPay 🎉
          </h1>
          <p className="text-base font-semibold text-duo-gray-dark">
            You need MiniPay to play &amp; win prizes.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <a href={ANDROID_URL} target="_blank" rel="noreferrer">
            <BigButton variant="green" size="lg" className="w-full">
              Get MiniPay on Android
            </BigButton>
          </a>
          <a href={IOS_URL} target="_blank" rel="noreferrer">
            <BigButton variant="blue" size="lg" className="w-full">
              Get MiniPay on iOS
            </BigButton>
          </a>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-duo-gray-dark">
            Link to open in MiniPay
          </div>
          <code className="block w-full overflow-x-auto rounded-xl border-2 border-duo-gray-light bg-duo-cream px-3 py-2 text-sm font-mono text-duo-ink">
            {targetUrl}
          </code>
          <button
            type="button"
            onClick={copy}
            className="btn-3d mt-2 w-full rounded-xl border-2 border-duo-gray-light bg-white px-4 py-2 text-sm font-black uppercase tracking-wide text-duo-ink shadow-3d-sm hover:bg-duo-cream"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}

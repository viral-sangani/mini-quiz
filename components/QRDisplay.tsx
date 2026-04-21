"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QRDisplay({ url, size = 256 }: { url: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: size, margin: 1 })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  return (
    <div
      className="inline-flex items-center justify-center rounded-3xl border-4 border-duo-gray-light bg-white p-4 shadow-3d"
      style={{ width: size + 40, height: size + 40 }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="QR code"
          width={size}
          height={size}
          className="rounded-xl"
        />
      ) : (
        <div
          className="animate-pulse rounded-xl bg-duo-gray-light"
          style={{ width: size, height: size }}
        />
      )}
    </div>
  );
}

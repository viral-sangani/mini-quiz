import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import {
  PostHogAnalytics,
  PostHogProfileIdentity,
} from "@/components/PostHogAnalytics";
import { PlayerCacheProvider } from "@/lib/player-cache";
import { ProfileProvider } from "@/lib/profile-context";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mini Quiz — Celo × MiniPay",
  description: "A live multiplayer quiz for the MiniPay roadshow",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4CD050",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="font-display antialiased">
        <PostHogAnalytics>
          <ProfileProvider>
            <PostHogProfileIdentity />
            <PlayerCacheProvider>{children}</PlayerCacheProvider>
          </ProfileProvider>
        </PostHogAnalytics>
      </body>
    </html>
  );
}

import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
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
  icons: [{ rel: "icon", url: "/icon.svg" }],
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
        <ProfileProvider>
          <PlayerCacheProvider>{children}</PlayerCacheProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}

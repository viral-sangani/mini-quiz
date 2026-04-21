import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";

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
  themeColor: "#58CC02",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="font-display antialiased">{children}</body>
    </html>
  );
}

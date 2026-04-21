/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Bypass ngrok's free-tier interstitial warning page so MiniPay's
          // in-app webview gets our HTML directly.
          { key: "ngrok-skip-browser-warning", value: "1" },
        ],
      },
    ];
  },
};

export default nextConfig;

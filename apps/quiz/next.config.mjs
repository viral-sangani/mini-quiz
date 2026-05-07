/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mini-quiz/shared"],
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
  async redirects() {
    return [
      // /upcoming was the old browse page; merged into the home tab.
      { source: "/upcoming", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Never cache HTML documents / API responses, so the in-app WebView
        // always loads the latest deploy on relaunch. Hashed static assets
        // under /_next/ are excluded and stay immutably cached.
        source: "/((?!_next/).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

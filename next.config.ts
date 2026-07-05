import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // Lien d'invitation « vanity » : on communique drivecord.app/discord
        // partout, et il redirige vers l'invitation Discord réelle. Non
        // permanent (307) exprès : si l'invitation change un jour, il suffit
        // de modifier l'URL ci-dessous — aucun cache navigateur à purger.
        source: "/discord",
        destination: "https://discord.gg/VjgHeN45Jb",
        permanent: false,
      },
      {
        // Lien vanity vers le dashboard DriveBot (hébergé séparément). Non
        // permanent (307) exprès pour pouvoir changer l'URL sans purge cache.
        source: "/drivebot",
        destination: "https://drivebot-dashboard.vercel.app/",
        permanent: false,
      },
    ];
  },
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

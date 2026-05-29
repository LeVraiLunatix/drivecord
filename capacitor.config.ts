import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lunatix.drivecord",
  appName: "Drivecord",
  // Minimal placeholder — the real app loads from server.url below
  webDir: "capacitor-web",
  server: {
    // Load the live Vercel deployment — all API routes, auth, DB work normally
    url: "https://drivecord.vercel.app",
    cleartext: false,
    // Allow navigating within the app
    allowNavigation: ["drivecord.vercel.app", "*.discord.com", "accounts.google.com"],
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0a0a",
    preferredContentMode: "mobile",
    scrollEnabled: true,
  },
};

export default config;

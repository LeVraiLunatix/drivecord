/**
 * Next config for the DESKTOP build only (Tauri client — `drivecord-desktop`).
 *
 * Not used by Vercel. `scripts/build-desktop.mjs` temporarily swaps this in for
 * `next.config.ts`, prunes `src/app` down to the shell routes, runs
 * `next build`, and restores everything.
 *
 * Produces a fully static `out/` (no server). All `/api/*` calls are made
 * cross-origin to `NEXT_PUBLIC_API_BASE` with a bearer token — see
 * `src/lib/api-base.ts`.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Isolated build dir — never touch the main `.next` (so a concurrent or prior
  // `npm run build` can't corrupt this build and vice-versa).
  distDir: ".next-desktop",
  images: { unoptimized: true },
  // `output: "export"` ignores redirects()/headers()/rewrites() — omitted on purpose.
  env: {
    NEXT_PUBLIC_DESKTOP: "1",
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE ?? "https://drivecord.app",
  },
};

export default nextConfig;

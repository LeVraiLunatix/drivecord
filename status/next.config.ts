import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Strict CSP. Everything is served from this origin: no third-party script, font, image or frame, no
 * form, no <base>, no plugin. `connect-src 'self'` is enough because the page only talks to its own
 * /api/status/summary. Scripts allow 'unsafe-inline' because the App Router streams its hydration data in
 * inline <script> tags; nonces would force dynamic rendering (no ISR) and SRI hashes do not cover those tags
 * (tried: the page then fails to hydrate). The risk is contained: nothing user-controlled is ever rendered as
 * HTML (Markdown is allow-listed, raw HTML dropped), so there is no injection point for an inline script.
 */
const csp = [
  "default-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const root = path.resolve(import.meta.dirname);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This project lives inside the Drivecord repo, which has its own lockfile and proxy.ts: never let Next
  // pick the parent directory as the workspace root.
  turbopack: { root },
  outputFileTracingRoot: root,
  // Incident files are read from disk at render time: make sure they ship with the serverless output.
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

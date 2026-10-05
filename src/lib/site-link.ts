"use client";

import { IS_DESKTOP } from "@/lib/api-base";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/** Public origin of the website (the desktop shell only embeds part of it). */
export const SITE_ORIGIN = "https://drivecord.app";

/**
 * Top-level routes embedded in the desktop shell — must match `KEEP_DIRS` in
 * `scripts/build-desktop.mjs`. Every other page only exists on the website.
 */
const SHELL_ROUTES = new Set([
  "",
  "drive",
  "settings",
  "setup",
  "login",
  "register",
  "desktop-sync",
  "desktop-uploads",
  "shares",
  "stats",
]);

/** True if `path` (app-relative) is a page that exists inside the desktop shell. */
export function isShellRoute(path: string): boolean {
  const first = path.replace(/^\/+/, "").split(/[/?#]/)[0] ?? "";
  return SHELL_ROUTES.has(first);
}

/** Opens a URL in the user's default browser (desktop app only). */
export function openInBrowser(url: string): void {
  void tauriInvoke("plugin:opener|open_url", { url }).catch(() => {
    window.location.href = url;
  });
}

/**
 * Navigates to a page that only exists on the website (`/admin`, `/docs`, …).
 * Web: plain in-tab navigation. Desktop: opens drivecord.app in the browser
 * instead of landing on a 404 inside the embedded shell.
 */
export function openSitePage(path: string): void {
  if (isDesktopApp()) {
    openInBrowser(`${SITE_ORIGIN}${path}`);
    return;
  }
  window.location.href = path;
}

/**
 * Origin for links meant to be shared (public `/s/<token>` pages). In the desktop
 * shell `location.origin` is tauri.localhost, which means nothing to anyone else.
 */
export function publicOrigin(): string {
  if (typeof window === "undefined") return "";
  return IS_DESKTOP ? SITE_ORIGIN : window.location.origin;
}

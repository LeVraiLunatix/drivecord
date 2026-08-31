"use client";

import * as React from "react";

/**
 * Detects whether the app is running inside the native Capacitor shell
 * (the iOS/Android app) versus a normal web browser.
 *
 * Capacitor injects `window.Capacitor` with `isNativePlatform()`.
 * We read it on mount (client-only) to avoid SSR hydration mismatches.
 */
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = React.useState(false);

  React.useEffect(() => {
    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;
    setIsNative(Boolean(cap?.isNativePlatform?.()));
  }, []);

  return isNative;
}

/**
 * True when running inside the iOS app build that provides a *native* UITabBar
 * (the shell appends "DrivecordNative" to the user-agent). In that case the web
 * hides its own CSS tab bar and lets the native bar drive navigation.
 */
export function hasNativeTabBar(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("DrivecordNative");
}

/** Synchronous check usable outside React (returns false during SSR). */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * True inside the Tauri desktop shell (`drivecord-desktop`). Tauri 2 injects
 * `window.__TAURI_INTERNALS__` into every webview it controls — including the
 * embedded shell and any remote page loaded during the login handoff.
 */
export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

/** Minimal access to Tauri's IPC without pulling in `@tauri-apps/api`. */
export function tauriInvoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke: (c: string, a?: unknown) => Promise<T> };
  }).__TAURI_INTERNALS__;
  if (!internals) return Promise.reject(new Error("Tauri IPC indisponible."));
  return internals.invoke(cmd, args);
}

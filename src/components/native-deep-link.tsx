"use client";

import * as React from "react";
import { isNativeApp } from "@/lib/use-platform";

/**
 * Listens for the app being opened via the drivecord:// custom URL scheme.
 * When the OAuth handoff returns drivecord://auth?code=XXX, navigate the
 * WebView to the exchange endpoint, which sets the in-app session cookie.
 */
export function NativeDeepLink() {
  React.useEffect(() => {
    if (!isNativeApp()) return;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", (data: { url: string }) => {
          try {
            const u = new URL(data.url);
            // drivecord://auth?code=XXX  → host "auth"
            if (u.protocol.replace(":", "") === "drivecord" && u.host === "auth") {
              const code = u.searchParams.get("code");
              if (code) {
                window.location.href = `/api/native-auth/exchange?code=${encodeURIComponent(code)}`;
              }
            }
          } catch {
            /* ignore malformed URLs */
          }
        });
        cleanup = () => handle.remove();
      } catch {
        /* @capacitor/app unavailable (web) */
      }
    })();

    return () => cleanup?.();
  }, []);

  return null;
}

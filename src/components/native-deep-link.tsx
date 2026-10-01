"use client";

import * as React from "react";
import { isNativeApp } from "@/lib/use-platform";
import { completeNativeSignIn, listenNativeSignIn } from "@/lib/native-auth";

/**
 * Brings a sign-in started from the app back into its WebView:
 *  - current builds: the system sign-in sheet hands drivecord://auth?code=…
 *    to `window.__drivecordAuthCallback`;
 *  - older builds: Safari opens the drivecord:// custom URL scheme
 *    (`appUrlOpen`).
 * Either way the code is exchanged for the in-app session cookie.
 */
export function NativeDeepLink() {
  React.useEffect(() => {
    if (!isNativeApp()) return;
    const stopSheet = listenNativeSignIn();
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", (data: { url: string }) => {
          void completeNativeSignIn(data.url);
        });
        cleanup = () => handle.remove();
      } catch {
        /* @capacitor/app unavailable (web) */
      }
    })();

    return () => {
      stopSheet();
      cleanup?.();
    };
  }, []);

  return null;
}

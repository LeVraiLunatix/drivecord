"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { apiUrl, IS_DESKTOP } from "@/lib/api-base";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Desktop login handoff — runs only in the REMOTE (drivecord.app) build loaded
 * inside the Tauri window during login. Once the webview holds a full session
 * (real login happened here), mint a bearer token, hand it to Rust for the OS
 * keychain, and tell the app to switch to the embedded shell.
 *
 * No-op on the web, and no-op in the embedded shell build (`IS_DESKTOP` — there
 * the token source is wired straight in `api-base.ts`).
 */
export function DesktopTokenBridge() {
  const { status, data } = useSession();

  React.useEffect(() => {
    if (IS_DESKTOP || !isDesktopApp()) return;
    if (status !== "authenticated" || data?.level !== "full") return;

    let cancelled = false;
    (async () => {
      try {
        const existing = await tauriInvoke<string | null>("get_token").catch(() => null);
        if (existing || cancelled) return;
        const res = await fetch(apiUrl("/api/auth/desktop-token"), { method: "POST" });
        if (!res.ok || cancelled) return;
        const { token } = (await res.json()) as { token: string };
        await tauriInvoke("save_token", { token });
        await tauriInvoke("enter_shell");
      } catch {
        /* stay on the web view; the user can retry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, data]);

  return null;
}

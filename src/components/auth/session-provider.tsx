"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { IS_DESKTOP, authFetch } from "@/lib/api-base";
import { fullSignOut } from "@/lib/auth/logout";
import { tauriInvoke } from "@/lib/use-platform";

const TOKEN_REFRESHED_KEY = "drivecord:desktopTokenRefreshedAt";
const TOKEN_REFRESH_EVERY = 24 * 60 * 60 * 1000;

/**
 * The bearer is a 30-day session JWT that never rolls like the web cookie does
 * — re-mint it (at most daily) while it's still valid so an app in regular use
 * never expires. Best effort: a failure just retries on the next launch.
 */
async function refreshDesktopToken(): Promise<void> {
  try {
    const last = Number(localStorage.getItem(TOKEN_REFRESHED_KEY) ?? 0);
    if (Date.now() - last < TOKEN_REFRESH_EVERY) return;
    const res = await authFetch("/api/auth/desktop-token", { method: "POST" });
    if (!res.ok) return;
    const { token } = (await res.json()) as { token?: string };
    if (!token) return;
    await tauriInvoke("save_token", { token });
    localStorage.setItem(TOKEN_REFRESHED_KEY, String(Date.now()));
  } catch {
    /* retry next launch */
  }
}

/**
 * On the web, NextAuth's SessionProvider reads the same-origin session cookie.
 *
 * In the Tauri desktop shell (`IS_DESKTOP`), the shell is served from
 * tauri://localhost and holds NO cookie — it authenticates with a bearer token.
 * So we fetch `/api/auth/session` once through `authFetch` (which attaches the
 * token; the server proxy turns it back into the cookie) and seed SessionProvider
 * with the result, disabling its own refetching.
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  if (!IS_DESKTOP) return <SessionProvider>{children}</SessionProvider>;
  return <DesktopSessionProvider>{children}</DesktopSessionProvider>;
}

function DesktopSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null | undefined>(
    undefined,
  );

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authFetch("/api/auth/session");
        const data: unknown = res.ok ? await res.json() : null;
        const ok =
          data && typeof data === "object" && Object.keys(data).length > 0;
        if (!ok) {
          // The server answered and the stored token isn't a session any more
          // (expired / revoked): back to the login screen instead of an empty,
          // drive-less shell. (Offline throws → catch below, token kept.)
          if (
            (res.ok || res.status === 401) &&
            !window.location.pathname.startsWith("/desktop-uploads")
          ) {
            localStorage.removeItem(TOKEN_REFRESHED_KEY);
            await fullSignOut();
            return;
          }
          if (alive) setSession(null);
          return;
        }
        void refreshDesktopToken();
        const s = data as Session;
        // The bearer JWT can carry a stale name/avatar — the DB is authoritative.
        try {
          const acc = await authFetch("/api/account");
          if (acc.ok) {
            const a = (await acc.json()) as { name?: string; image?: string };
            if (s.user) {
              if (a.image) s.user.image = a.image;
              if (a.name) s.user.name = a.name;
            }
          }
        } catch {
          /* keep the session as-is */
        }
        if (alive) setSession(s);
      } catch {
        if (alive) setSession(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Hold render until we know — avoids a flash of the logged-out UI.
  if (session === undefined) return null;

  return (
    <SessionProvider
      session={session}
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      {children}
    </SessionProvider>
  );
}

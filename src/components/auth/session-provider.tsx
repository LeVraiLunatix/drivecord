"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { IS_DESKTOP, authFetch } from "@/lib/api-base";

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
          if (alive) setSession(null);
          return;
        }
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

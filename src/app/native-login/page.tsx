"use client";

import * as React from "react";
import { signIn, signOut } from "next-auth/react";
import { Loader2 } from "lucide-react";

/**
 * Opened in the SYSTEM BROWSER by the app. Immediately starts the OAuth flow
 * for the requested provider, with the browser landing on /native-handoff once
 * authenticated (where a handoff code is generated for the app).
 *
 * The browser may already hold a drivecord session from a previous login done
 * here (the OAuth happens in this same browser). We sign that out FIRST so the
 * handoff code reflects ONLY the account that just authenticated — otherwise
 * switching accounts could hand the app back the old session.
 */
function NativeLoginInner() {
  React.useEffect(() => {
    const provider =
      new URLSearchParams(window.location.search).get("provider") ?? "discord";
    (async () => {
      await signOut({ redirect: false }).catch(() => {});
      signIn(provider, { callbackUrl: "/native-handoff" });
    })();
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Redirection vers la connexion…</p>
    </div>
  );
}

export default function NativeLoginPage() {
  return (
    <React.Suspense>
      <NativeLoginInner />
    </React.Suspense>
  );
}

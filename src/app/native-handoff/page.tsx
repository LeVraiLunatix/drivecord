"use client";

import * as React from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reached in the SYSTEM BROWSER right after OAuth (or a passkey) succeeds.
 * Fetches a one-time handoff code for the now-authenticated user and deep-links
 * back into the app (drivecord://auth?code=...). The app then exchanges the
 * code for its own session. A manual button is shown in case the auto-redirect
 * is blocked.
 *
 * Une session encore « en attente » (2FA, code email après 24 h) n'obtient pas
 * de code : on passe d'abord par /auth/challenge, qui revient ici une fois
 * l'étape validée — sans ça, la connexion depuis l'app échouait toujours pour
 * les comptes protégés.
 */
export default function NativeHandoffPage() {
  const [deepLink, setDeepLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/native-auth/code");
        if (res.status === 401) {
          const session = await fetch("/api/auth/session")
            .then((r) => r.json())
            .catch(() => null);
          if (session?.user && session.level === "pending") {
            window.location.replace("/auth/challenge?next=/native-handoff");
            return;
          }
        }
        if (!res.ok) throw new Error();
        const { code } = await res.json();
        if (cancelled) return;
        const link = `drivecord://auth?code=${encodeURIComponent(code)}`;
        setDeepLink(link);
        // Auto-open the app.
        window.location.href = link;
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {error ? (
        <>
          <p className="text-sm text-destructive">
            La connexion n&apos;a pas abouti. Reviens dans l&apos;app et réessaie.
          </p>
          <Button asChild variant="outline" className="gap-2">
            <a href="drivecord://">
              Revenir à Drivecord
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Connexion réussie — retour à l&apos;app…</p>
          {deepLink && (
            <Button asChild className="mt-2 gap-2">
              <a href={deepLink}>
                Ouvrir Drivecord
                <ArrowRight className="size-4" />
              </a>
            </Button>
          )}
        </>
      )}
    </div>
  );
}

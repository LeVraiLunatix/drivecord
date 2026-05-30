"use client";

import * as React from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reached in the SYSTEM BROWSER right after OAuth succeeds. Fetches a one-time
 * handoff code for the now-authenticated user and deep-links back into the app
 * (drivecord://auth?code=...). The app then exchanges the code for its own
 * session. A manual button is shown in case the auto-redirect is blocked.
 */
export default function NativeHandoffPage() {
  const [deepLink, setDeepLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/native-auth/code");
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
        <p className="text-sm text-destructive">
          Une erreur est survenue. Reviens dans l&apos;app et réessaie.
        </p>
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

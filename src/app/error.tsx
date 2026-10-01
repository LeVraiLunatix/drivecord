"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Last-resort screen when a page crashes: friendly, with a retry, never a blank page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <TriangleAlert className="size-10 text-amber-400" />
      <h1 className="text-xl font-semibold">Quelque chose s&apos;est mal passé</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Cette page a rencontré une erreur. Tes fichiers ne sont pas touchés. Réessaie, et si ça persiste, recharge la page.
      </p>
      {error.digest && <p className="font-mono text-[11px] text-muted-foreground">Réf. {error.digest}</p>}
      <div className="flex gap-2">
        <Button onClick={reset}>Réessayer</Button>
        <Button variant="outline" onClick={() => window.location.assign("/")}>Accueil</Button>
      </div>
    </main>
  );
}

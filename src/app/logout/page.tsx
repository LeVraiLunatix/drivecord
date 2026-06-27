"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { mutate } from "swr";
import { CircleCheckBig, Loader2, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthBackground } from "@/components/auth/auth-background";
import { wipeLocalDrives } from "@/lib/storage/drives";

/**
 * Page de déconnexion. À l'arrivée, elle effectue réellement la déconnexion
 * (purge du cache SWR, des drives locaux IndexedDB, puis fin de session
 * Auth.js), puis affiche une confirmation. Idempotente : y arriver directement
 * déconnecte aussi.
 */
export default function LogoutPage() {
  const router = useRouter();
  const [done, setDone] = React.useState(false);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      await mutate(() => true, undefined, { revalidate: false }).catch(() => {});
      await wipeLocalDrives().catch(() => {});
      await signOut({ redirect: false }).catch(() => {});
      setDone(true);
    })();
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <AuthBackground />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <CloudUpload className="size-7 text-white" />
          </div>
          <span className="font-mono text-xl font-semibold tracking-tight">
            drivecord
          </span>
        </div>

        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            {done ? (
              <>
                <CircleCheckBig className="size-12 text-green-400" />
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold">Tu es déconnecté</h1>
                  <p className="text-sm text-muted-foreground">
                    À bientôt sur Drivecord&nbsp;👋
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 pt-2">
                  <Button className="w-full" onClick={() => router.push("/login")}>
                    Se reconnecter
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push("/")}
                  >
                    Retour à l&apos;accueil
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Loader2 className="size-10 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Déconnexion en cours…</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

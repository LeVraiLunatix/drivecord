"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginWithPasskey } from "@/lib/auth/passkey-client";

/**
 * Opened in the SYSTEM BROWSER by the app. Immediately starts the OAuth flow
 * for the requested provider, with the browser landing on /native-handoff once
 * authenticated (where a handoff code is generated for the app).
 *
 * The browser may already hold a drivecord session from a previous login done
 * here (the OAuth happens in this same browser). We sign that out FIRST so the
 * handoff code reflects ONLY the account that just authenticated — otherwise
 * switching accounts could hand the app back the old session.
 *
 * `provider=passkey` : la WebView de l'app ne peut pas utiliser les passkeys,
 * on les utilise donc ici, dans Safari. Safari exige un geste de l'utilisateur
 * pour WebAuthn : d'où le bouton au lieu d'un lancement automatique.
 */
function NativeLoginInner() {
  const provider = useSearchParams().get("provider") ?? "discord";

  React.useEffect(() => {
    const p = provider;
    if (p === "passkey") return;
    (async () => {
      await signOut({ redirect: false }).catch(() => {});
      signIn(p, { callbackUrl: "/native-handoff" });
    })();
  }, [provider]);

  if (provider === "passkey") return <PasskeyStep />;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Redirection vers la connexion…</p>
    </div>
  );
}

function PasskeyStep() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    await signOut({ redirect: false }).catch(() => {});
    const r = await loginWithPasskey();
    if (r.ok) {
      window.location.assign("/native-handoff");
      return;
    }
    setBusy(false);
    setError(r.error ?? "Connexion par passkey impossible.");
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
        <KeyRound className="size-7 text-white" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">Connexion à Drivecord par passkey</p>
        <p className="text-sm text-muted-foreground">Utilise Face ID ou Touch ID, tu reviendras ensuite dans l&apos;app.</p>
      </div>
      <Button onClick={start} disabled={busy} className="gap-2">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        Continuer avec ma passkey
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
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

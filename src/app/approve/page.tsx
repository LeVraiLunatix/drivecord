"use client";

import * as React from "react";
import { ShieldCheck, CircleCheckBig, MonitorSmartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OtpInput } from "@/components/auth/otp-input";

/**
 * Onglet « Approuver une connexion ».
 *
 * Sur un appareil de confiance (déjà connecté), on saisit le code à 4 chiffres
 * affiché sur l'appareil qui veut se connecter → la connexion est approuvée à
 * distance. C'est la voie d'authentification principale dans l'app.
 */
export default function ApprovePage() {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [approved, setApproved] = React.useState<string | null>(null);

  const submit = async (value?: string) => {
    const c = value ?? code;
    if (c.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login-requests/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortCode: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setApproved(data.deviceLabel ?? "l'appareil");
        toast.success("Connexion approuvée.");
      } else {
        setError(data.error ?? "Code invalide.");
        setCode("");
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center tabbar-pad px-6 pb-20"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
          <ShieldCheck className="size-7 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Approuver une connexion</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Saisis le code à 4 chiffres affiché sur l&apos;appareil qui veut se
          connecter à ton compte.
        </p>
      </div>

      <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
        <CardContent className="space-y-5 py-6">
          {approved ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <CircleCheckBig className="size-12 text-green-400" />
              <div>
                <p className="font-semibold">Connexion approuvée</p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  <MonitorSmartphone className="size-4" />
                  {approved}
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-1"
                onClick={() => {
                  setApproved(null);
                  setCode("");
                }}
              >
                Approuver une autre connexion
              </Button>
            </div>
          ) : (
            <>
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={(v) => submit(v)}
                length={4}
                disabled={busy}
                autoFocus
              />
              {error && (
                <p className="text-center text-sm text-red-400" role="alert">
                  {error}
                </p>
              )}
              <Button
                onClick={() => submit()}
                disabled={busy || code.length !== 4}
                className="w-full"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Approuver
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Loader2, MailCheck, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthBackground } from "@/components/auth/auth-background";
import { OtpInput } from "@/components/auth/otp-input";
import { CrossDeviceWait } from "@/components/auth/cross-device-wait";
import type { PendingReason } from "@/lib/auth/auth-level";

const COPY: Record<string, { title: string; desc: (email: string) => string }> = {
  email_verify: {
    title: "Vérifie ton adresse email",
    desc: (e) =>
      `On vient d'envoyer un code à 6 chiffres à ${e}. Entre-le pour activer ton compte.`,
  },
  login_24h: {
    title: "Confirme ta connexion",
    desc: (e) =>
      `Pour ta sécurité, entre le code à 6 chiffres qu'on vient d'envoyer à ${e}.`,
  },
};

export function ChallengeForm({
  email,
  reason,
  canCrossDevice = false,
}: {
  email: string;
  reason: PendingReason;
  canCrossDevice?: boolean;
}) {
  const router = useRouter();
  const [crossDevice, setCrossDevice] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  const copy = COPY[reason ?? "login_24h"] ?? COPY.login_24h;

  // Auto-send the first code once on mount.
  const sentRef = React.useRef(false);
  React.useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    const send = async () => {
      try {
        const res = await fetch("/api/auth/email-code/send", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        setCooldown(data.cooldownSec ?? (res.ok ? 60 : 0));
      } catch {
        /* user can retry via the resend button */
      }
    };
    void send();
  }, []);

  // Resend cooldown countdown.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const resend = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      const res = await fetch("/api/auth/email-code/send", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCooldown(data.cooldownSec ?? 60);
        toast.success("Nouveau code envoyé.");
      } else {
        setCooldown(data.cooldownSec ?? 0);
        toast.error(data.error ?? "Impossible d'envoyer le code.");
      }
    } catch {
      toast.error("Erreur réseau.");
    }
  };

  const submit = async (value?: string) => {
    const c = value ?? code;
    if (c.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Vérifié !");
        router.push("/drive");
        router.refresh();
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

  if (crossDevice) {
    return (
      <div className="relative flex min-h-[100dvh] flex-col">
        <AuthBackground />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
          <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Approuver depuis un autre appareil
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CrossDeviceWait onBack={() => setCrossDevice(false)} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <AuthBackground />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <MailCheck className="size-7 text-white" />
          </div>
          <span className="font-mono text-xl font-semibold tracking-tight">
            drivecord
          </span>
        </div>

        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{copy.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">{copy.desc(email)}</p>

            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={(v) => submit(v)}
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
              disabled={busy || code.length !== 6}
              className="w-full"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Valider
            </Button>

            {reason === "login_24h" && canCrossDevice && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setCrossDevice(true)}
              >
                <MonitorSmartphone className="size-4" />
                Approuver depuis un autre appareil
              </Button>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0}
                className="underline-offset-4 hover:underline disabled:no-underline disabled:opacity-50"
              >
                {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : "Renvoyer le code"}
              </button>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="underline-offset-4 hover:underline"
              >
                Annuler
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import {
  Loader2,
  ShieldCheck,
  Smartphone,
  Mail,
  MonitorSmartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthBackground } from "@/components/auth/auth-background";
import { OtpInput } from "@/components/auth/otp-input";
import { CrossDeviceWait } from "@/components/auth/cross-device-wait";

type Method = "totp" | "email" | "device";

const METHOD_LABEL: Record<Method, string> = {
  totp: "Utiliser l'application d'authentification",
  email: "Recevoir un code par email",
  device: "Approuver depuis un autre appareil",
};

function MethodIcon({ method }: { method: Method }) {
  if (method === "email") return <Mail className="size-3.5" />;
  if (method === "device") return <MonitorSmartphone className="size-3.5" />;
  return <Smartphone className="size-3.5" />;
}

export function TwoFactorChallenge({
  email,
  preferred,
  totpEnabled,
  emailEnabled,
  deviceEnabled,
}: {
  email: string;
  preferred: Method;
  totpEnabled: boolean;
  emailEnabled: boolean;
  deviceEnabled: boolean;
}) {
  const enabledMethods = React.useMemo<Method[]>(
    () =>
      [
        totpEnabled ? "totp" : null,
        emailEnabled ? "email" : null,
        deviceEnabled ? "device" : null,
      ].filter(Boolean) as Method[],
    [totpEnabled, emailEnabled, deviceEnabled],
  );

  const initial: Method = enabledMethods.includes(preferred)
    ? preferred
    : (enabledMethods[0] ?? "totp");

  const [active, setActive] = React.useState<Method>(initial);
  const [recoveryMode, setRecoveryMode] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [recoveryCode, setRecoveryCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  const isEmail = active === "email" && !recoveryMode;
  const isDevice = active === "device" && !recoveryMode;

  const sendEmailCode = React.useCallback(async (notify: boolean) => {
    try {
      const res = await fetch("/api/auth/2fa/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.emailSent) {
        setCooldown(data.cooldownSec ?? 60);
        if (notify) toast.success("Nouveau code envoyé.");
      } else if (!res.ok) {
        setCooldown(data.cooldownSec ?? 0);
        if (notify) toast.error(data.error ?? "Erreur.");
      }
    } catch {
      if (notify) toast.error("Erreur réseau.");
    }
  }, []);

  // Envoie un code email à l'entrée en mode email (une fois par entrée).
  const sentRef = React.useRef(false);
  React.useEffect(() => {
    if (active === "email" && !recoveryMode) {
      if (sentRef.current) return;
      sentRef.current = true;
      void sendEmailCode(false);
    } else {
      sentRef.current = false;
    }
  }, [active, recoveryMode, sendEmailCode]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submit = async (value?: string) => {
    const c = recoveryMode ? recoveryCode.trim() : (value ?? code);
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, recovery: recoveryMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Connexion confirmée !");
        // Navigation DURE : session promue via route custom → recharge pour que
        // useSession + la sync des drives suivent (sinon bascule vers /setup).
        window.location.assign("/drive");
        return;
      } else {
        setError(data.error ?? "Code incorrect.");
        setCode("");
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: Method) => {
    setActive(m);
    setRecoveryMode(false);
    setCode("");
    setError(null);
  };

  const otherMethods = enabledMethods.filter((m) => m !== active);

  const title = recoveryMode
    ? "Code de récupération"
    : isEmail
      ? "Vérification par email"
      : isDevice
        ? "Approbation par appareil"
        : "Double authentification";
  const desc = recoveryMode
    ? "Entre l'un de tes codes de récupération."
    : isEmail
      ? `Entre le code à 6 chiffres envoyé à ${email}.`
      : isDevice
        ? "Approuve cette connexion depuis un autre appareil déjà connecté (onglet « Approuver »), ou saisis-y le code ci-dessous."
        : "Entre le code affiché dans ton application d'authentification.";

  const showValidate = recoveryMode || (!isDevice && !recoveryMode);

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <AuthBackground />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <ShieldCheck className="size-7 text-white" />
          </div>
          <span className="font-mono text-xl font-semibold tracking-tight">
            drivecord
          </span>
        </div>

        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">{desc}</p>

            {recoveryMode ? (
              <Input
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="xxxxx-xxxxx"
                autoFocus
                autoComplete="one-time-code"
                aria-label="Code de récupération"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
            ) : isDevice ? (
              <CrossDeviceWait onBack={() => setRecoveryMode(true)} />
            ) : (
              <OtpInput
                key={active}
                value={code}
                onChange={setCode}
                onComplete={(v) => submit(v)}
                disabled={busy}
                autoFocus
              />
            )}

            {error && (
              <p className="text-center text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            {showValidate && (
              <Button
                onClick={() => submit()}
                disabled={
                  busy || (recoveryMode ? !recoveryCode.trim() : code.length !== 6)
                }
                className="w-full"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Valider
              </Button>
            )}

            {/* Renvoyer le code (email) */}
            {isEmail && (
              <div className="text-center text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => cooldown <= 0 && sendEmailCode(true)}
                  disabled={cooldown > 0}
                  className="underline-offset-4 hover:underline disabled:no-underline disabled:opacity-50"
                >
                  {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : "Renvoyer le code"}
                </button>
              </div>
            )}

            {/* Autres méthodes */}
            <div className="space-y-2 border-t border-border/50 pt-3">
              {!recoveryMode &&
                otherMethods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchTo(m)}
                    className="flex w-full items-center justify-center gap-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <MethodIcon method={m} />
                    {METHOD_LABEL[m]}
                  </button>
                ))}

              <button
                type="button"
                onClick={() => {
                  setRecoveryMode((m) => !m);
                  setError(null);
                }}
                className="block w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {recoveryMode
                  ? "Revenir au second facteur"
                  : "Utiliser un code de récupération"}
              </button>

              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="block w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Annuler et se déconnecter
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

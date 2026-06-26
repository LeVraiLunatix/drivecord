"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ShieldCheck,
  Smartphone,
  Mail,
  Loader2,
  Copy,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/auth/otp-input";

type Status = {
  enabled: boolean;
  method: string | null;
  totpConfigured: boolean;
  recoveryRemaining: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const T = {
  intro:
    "Ajoute une seconde étape à la connexion : un code temporaire en plus de ton mot de passe.",
  recoveryWarn:
    "Chaque code ne fonctionne qu'une seule fois. Garde-les en lieu sûr : ils te permettent de te connecter si tu perds ton second facteur.",
  recoveryTitle: "Conserve tes codes de récupération",
  appDesc: "Google Authenticator, Authy, 1Password… Scanne le QR code.",
  emailDesc: "Reçois un code à 6 chiffres par email à chaque connexion.",
};

function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const copy = () => {
    void navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Codes copiés.");
  };
  const download = () => {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drivecord-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm font-medium">{T.recoveryTitle}</p>
      <p className="text-xs text-muted-foreground">{T.recoveryWarn}</p>
      <div className="grid grid-cols-2 gap-1.5 font-mono text-sm">
        {codes.map((c) => (
          <span key={c} className="rounded bg-card/60 px-2 py-1 text-center">
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="size-4" />
          Copier
        </Button>
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="size-4" />
          Télécharger
        </Button>
        <Button size="sm" onClick={onDone} className="ml-auto">
          J&apos;ai noté mes codes
        </Button>
      </div>
    </div>
  );
}

export function TwoFactorManager() {
  const { data, mutate, isLoading } = useSWR<Status>(
    "/api/settings/2fa",
    fetcher,
  );
  const [qr, setQr] = React.useState<string | null>(null);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [showDisable, setShowDisable] = React.useState(false);
  const [disableCode, setDisableCode] = React.useState("");

  const startTotp = async () => {
    setBusy(true);
    const res = await fetch("/api/settings/2fa/totp/setup", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setQr(d.qr);
    else toast.error(d.error ?? "Erreur.");
  };

  const confirmTotp = async () => {
    setBusy(true);
    const res = await fetch("/api/settings/2fa/totp/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setCodes(d.recoveryCodes);
      setQr(null);
      setToken("");
      mutate();
    } else {
      toast.error(d.error ?? "Code incorrect.");
    }
  };

  const enableEmail = async () => {
    setBusy(true);
    const res = await fetch("/api/settings/2fa/email", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setCodes(d.recoveryCodes);
      mutate();
    } else {
      toast.error(d.error ?? "Erreur.");
    }
  };

  const regenerate = async () => {
    setBusy(true);
    const res = await fetch("/api/settings/2fa/recovery", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setCodes(d.recoveryCodes);
      mutate();
    } else {
      toast.error(d.error ?? "Erreur.");
    }
  };

  const disable = async () => {
    setBusy(true);
    const res = await fetch("/api/settings/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: disableCode.trim() }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      toast.success("Double authentification désactivée.");
      setShowDisable(false);
      setDisableCode("");
      mutate();
    } else {
      toast.error(d.error ?? "Code incorrect.");
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <ShieldCheck className="size-4 text-muted-foreground" />
      <h3 className="text-sm font-medium">Double authentification</h3>
    </div>
  );

  if (codes) {
    return (
      <div className="space-y-4">
        {header}
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      </div>
    );
  }

  // TOTP setup in progress: show the QR + confirmation field.
  if (qr) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-xs text-muted-foreground">{T.appDesc}</p>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR code à scanner dans ton application d'authentification"
            width={200}
            height={200}
            className="rounded-lg bg-white p-2"
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Puis entre le code à 6 chiffres généré :
        </p>
        <OtpInput value={token} onChange={setToken} onComplete={confirmTotp} />
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => {
              setQr(null);
              setToken("");
            }}
          >
            Annuler
          </Button>
          <Button
            className="flex-1"
            onClick={confirmTotp}
            disabled={busy || token.length !== 6}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Activer
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  // Enabled state.
  if (data.enabled) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
          <p className="text-sm font-medium text-green-400">
            Activée ·{" "}
            {data.method === "email" ? "code par email" : "application"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.recoveryRemaining} code
            {data.recoveryRemaining > 1 ? "s" : ""} de récupération restant
            {data.recoveryRemaining > 1 ? "s" : ""}.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={regenerate} disabled={busy}>
            Régénérer les codes
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-400 hover:text-red-300"
            onClick={() => setShowDisable((s) => !s)}
          >
            Désactiver
          </Button>
        </div>

        {showDisable && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
            <p className="text-xs text-muted-foreground">
              Entre un code 2FA ou un code de récupération pour confirmer.
            </p>
            <div className="flex gap-2">
              <Input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="Code"
                aria-label="Code de confirmation"
              />
              <Button
                variant="destructive"
                onClick={disable}
                disabled={busy || !disableCode.trim()}
              >
                Confirmer
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Disabled state: offer the two methods.
  return (
    <div className="space-y-4">
      {header}
      <p className="text-xs text-muted-foreground">{T.intro}</p>

      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-3">
          <Smartphone className="size-5 shrink-0 text-violet-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Application d&apos;authentification</p>
            <p className="text-xs text-muted-foreground">{T.appDesc}</p>
          </div>
          <Button size="sm" onClick={startTotp} disabled={busy}>
            Configurer
          </Button>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-3">
          <Mail className="size-5 shrink-0 text-violet-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Code par email</p>
            <p className="text-xs text-muted-foreground">{T.emailDesc}</p>
          </div>
          <Button size="sm" variant="outline" onClick={enableEmail} disabled={busy}>
            Activer
          </Button>
        </div>
      </div>
    </div>
  );
}

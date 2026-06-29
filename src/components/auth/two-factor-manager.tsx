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
  Star,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/auth/otp-input";

type Method = "totp" | "email";

type Status = {
  enabled: boolean;
  totpEnabled: boolean;
  emailEnabled: boolean;
  preferred: Method | null;
  recoveryRemaining: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const T = {
  intro:
    "Ajoute une seconde étape à la connexion : un code temporaire en plus de ton mot de passe. Tu peux activer plusieurs méthodes et choisir ta préférée.",
  recoveryWarn:
    "Chaque code ne fonctionne qu'une seule fois. Garde-les en lieu sûr : ils te permettent de te connecter si tu perds ton second facteur.",
  recoveryTitle: "Conserve tes codes de récupération",
  appDesc: "Google Authenticator, Authy, 1Password… Scanne le QR code.",
  emailDesc: "Reçois un code à 6 chiffres par email à chaque connexion.",
};

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
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
  const { data, mutate, isLoading } = useSWR<Status>("/api/settings/2fa", fetcher);
  const [qr, setQr] = React.useState<string | null>(null);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [disableTarget, setDisableTarget] = React.useState<Method | null>(null);
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
      if (d.recoveryCodes) setCodes(d.recoveryCodes);
      else toast.success("Application d'authentification activée.");
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
      if (d.recoveryCodes) setCodes(d.recoveryCodes);
      else toast.success("Code par email activé.");
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

  const setPreferred = async (method: Method) => {
    setBusy(true);
    const res = await fetch("/api/settings/2fa/preferred", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Méthode préférée mise à jour.");
      mutate();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Erreur.");
    }
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    setBusy(true);
    const res = await fetch("/api/settings/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: disableCode.trim(), method: disableTarget }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      toast.success("Méthode désactivée.");
      setDisableTarget(null);
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

  // TOTP setup in progress.
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

  const methodCard = (
    method: Method,
    icon: React.ReactNode,
    name: string,
    desc: string,
    enabled: boolean,
    onEnable: () => void,
    enableLabel: string,
  ) => {
    const isPreferred = data.preferred === method;
    return (
      <div className="rounded-lg border border-border/60 bg-card/40 p-3">
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-violet-400">{icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-medium">{name}</p>
              {enabled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
                  <Check className="size-2.5" /> Activée
                </span>
              )}
              {enabled && isPreferred && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                  <Star className="size-2.5" /> Préférée
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
          </div>
          {!enabled ? (
            <Button size="sm" onClick={onEnable} disabled={busy} className="shrink-0">
              {enableLabel}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-red-400 hover:text-red-300"
              onClick={() => {
                setDisableTarget(method);
                setDisableCode("");
              }}
              disabled={busy}
            >
              Désactiver
            </Button>
          )}
        </div>

        {/* Bouton « définir préférée » (si activée, pas déjà préférée, et l'autre méthode est aussi active) */}
        {enabled && !isPreferred && data.totpEnabled && data.emailEnabled && (
          <button
            type="button"
            onClick={() => setPreferred(method)}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
          >
            <Star className="size-3" /> Définir comme préférée
          </button>
        )}

        {/* Confirmation de désactivation */}
        {disableTarget === method && (
          <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">
              Entre un code 2FA (de l&apos;app) ou un code de récupération pour
              confirmer.
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
                onClick={confirmDisable}
                disabled={busy || !disableCode.trim()}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Confirmer
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setDisableTarget(null)}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Annuler
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {header}
      <p className="text-xs text-muted-foreground">{T.intro}</p>

      <div className="space-y-2">
        {methodCard(
          "totp",
          <Smartphone className="size-5" />,
          "Application d'authentification",
          T.appDesc,
          data.totpEnabled,
          startTotp,
          "Configurer",
        )}
        {methodCard(
          "email",
          <Mail className="size-5" />,
          "Code par email",
          T.emailDesc,
          data.emailEnabled,
          enableEmail,
          "Activer",
        )}
      </div>

      {/* Codes de récupération (si 2FA active) */}
      {data.enabled && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card/30 px-3 py-2.5">
          <p className="mr-auto text-xs text-muted-foreground">
            {data.recoveryRemaining} code
            {data.recoveryRemaining > 1 ? "s" : ""} de récupération restant
            {data.recoveryRemaining > 1 ? "s" : ""}.
          </p>
          <Button size="sm" variant="outline" onClick={regenerate} disabled={busy}>
            Régénérer
          </Button>
        </div>
      )}
    </div>
  );
}

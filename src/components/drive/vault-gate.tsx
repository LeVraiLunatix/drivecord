"use client";

import * as React from "react";
import { apiFetcher as fetcher } from "@/lib/api-base";
import useSWR from "swr";
import { Delete, Lock, ShieldCheck, Loader2, KeyRound, Fingerprint } from "lucide-react";
import { Accent } from "@/kitcord";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { biometryAvailable, runBiometric } from "@/lib/biometric";
import { createVault, unlockVault, unlockVaultWithMk, type VaultInfo } from "@/lib/e2ee-client/vault";

/**
 * Locks the vault section behind a PIN. Shows a create-PIN form if none exists,
 * otherwise a PIN entry. Calls `onUnlock` once the correct PIN is entered.
 */
export function VaultGate({ onUnlock }: { onUnlock: () => void }) {
  const { data, isLoading, mutate } = useSWR<VaultInfo>(
    "/api/account/vault-pin",
    fetcher,
    { revalidateOnFocus: false },
  );
  const [pin, setPin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [bioAvailable, setBioAvailable] = React.useState(false);

  // Detect biometrics (native app only). Auto-prompt once if a PIN exists.
  React.useEffect(() => {
    let cancelled = false;
    biometryAvailable().then((ok) => {
      if (cancelled) return;
      setBioAvailable(ok);
    });
    return () => { cancelled = true; };
  }, []);

  // The parent passes an inline `onUnlock`: keep it in a ref so a re-render of
  // the drive page doesn't recreate `tryBiometric` and re-trigger the prompt.
  const onUnlockRef = React.useRef(onUnlock);
  React.useEffect(() => { onUnlockRef.current = onUnlock; });

  const tryBiometric = React.useCallback(async () => {
    const ok = await runBiometric();
    if (!ok) return;
    // With the storage unlocked, the vault key is available from its Master-Key-wrapped copy.
    // Without it the vault would open but none of its files could be decrypted.
    const unlocked = await unlockVaultWithMk().catch(() => false);
    if (!unlocked) { toast.error("Face ID ne suffit pas ici : entre ton code."); return; }
    onUnlockRef.current();
  }, []);

  // Once we know a PIN exists and biometrics are available, offer Face ID first
  // — once per opening of the gate (cancelling must not bring it straight back).
  const autoPrompted = React.useRef(false);
  React.useEffect(() => {
    if (!data?.hasPin || !bioAvailable || autoPrompted.current) return;
    autoPrompted.current = true;
    void tryBiometric();
  }, [data?.hasPin, bioAvailable, tryBiometric]);

  if (isLoading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const createPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,12}$/.test(pin)) { toast.error("Le code doit faire 4 à 12 chiffres"); return; }
    if (pin !== confirm) { toast.error("Les codes ne correspondent pas"); return; }
    setBusy(true);
    try {
      // The PIN is stretched (Argon2id) on this device; the server only ever sees a verifier.
      await createVault(pin);
      toast.success("Coffre-fort créé et chiffré 🔒");
      await mutate();
      onUnlock();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  };

  const verifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (await unlockVault(pin, data)) onUnlock();
      else { toast.error("Code incorrect"); setPin(""); }
    } catch (err) { toast.error((err as Error).message ?? "Erreur"); }
    finally { setBusy(false); }
  };

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 12);
  const tap = (d: string) => setPin((p) => digits(p + d));
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const roundKey = "cord-menu-button inline-flex size-[68px] items-center justify-center text-2xl font-semibold [font-family:var(--cord-font-display)] disabled:opacity-50 sm:size-[72px]";

  return (
    <div className="flex flex-1 items-start justify-center px-2 pb-8 pt-2 sm:pt-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <span className="cord-menu-button inline-flex size-16 items-center justify-center text-[var(--cord-light-mid)]" aria-hidden="true">
          <Lock className="size-7" />
        </span>

        {data.hasPin ? (
          <>
            <h2 className="cord-display mt-6 text-[clamp(2.25rem,7vw,3.25rem)]">
              Coffre<Accent>-fort</Accent>
            </h2>
            <p className="cord-lede mt-4">Saisis ton code pour accéder à tes fichiers protégés.</p>
            <form onSubmit={verifyPin} className="mt-9 flex w-full flex-col items-center">
              {/* Le champ reste réel (clavier, gestionnaire de mots de passe) mais invisible : les points le montrent. */}
              <label className="sr-only" htmlFor="vault-pin">Code</label>
              <input
                id="vault-pin" className="sr-only" type="password" inputMode="none" autoFocus autoComplete="current-password"
                value={pin} onChange={(e) => setPin(digits(e.target.value))}
              />
              <div className="flex h-5 items-center gap-4" role="img" aria-label={`${pin.length} chiffre${pin.length > 1 ? "s" : ""} saisi${pin.length > 1 ? "s" : ""}`}>
                {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
                  <i key={i} className={cn("block size-3 rounded-full transition-colors", i < pin.length ? "bg-[var(--cord-light-core)]" : "bg-[var(--cord-line-strong)]")} />
                ))}
              </div>
              <div className="mt-9 grid grid-cols-3 gap-x-7 gap-y-3.5">
                {KEYS.map((k) => (
                  <button key={k} type="button" className={roundKey} onClick={() => tap(k)} disabled={busy} aria-label={k}>{k}</button>
                ))}
                <span aria-hidden="true" />
                <button type="button" className={roundKey} onClick={() => tap("0")} disabled={busy} aria-label="0">0</button>
                <button
                  type="button" aria-label="Effacer"
                  className="inline-flex size-[68px] items-center justify-center rounded-full text-[var(--cord-dim)] hover:text-foreground sm:size-[72px]"
                  onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy || !pin}
                >
                  <Delete className="size-6" />
                </button>
              </div>
              <button type="submit" data-primary className="cord-button mt-8 h-[52px] w-full max-w-[16rem] gap-2 text-base" disabled={busy || !pin}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Déverrouiller
              </button>
              {bioAvailable && (
                <button type="button" className="cord-button mt-3 h-[52px] w-full max-w-[16rem] gap-2 text-base" onClick={tryBiometric}>
                  <Fingerprint className="size-[18px]" />
                  Face ID / Touch ID
                </button>
              )}
            </form>
          </>
        ) : (
          <>
            <h2 className="cord-display mt-6 text-[clamp(2.25rem,7vw,3.25rem)]">
              Crée ton <Accent>coffre</Accent>
            </h2>
            <p className="cord-lede mt-4">Choisis un code (4 à 12 chiffres) pour protéger tes fichiers sensibles.</p>
            <form onSubmit={createPin} className="mt-9 w-full space-y-5">
              <div className="space-y-2 text-left">
                <Label htmlFor="pin" className="px-2 text-[var(--cord-dim)]">Nouveau code</Label>
                <Input id="pin" type="password" inputMode="numeric" autoFocus className="h-14 rounded-full px-6 text-base"
                  value={pin} onChange={(e) => setPin(digits(e.target.value))} placeholder="4 à 12 chiffres" />
              </div>
              <div className="space-y-2 text-left">
                <Label htmlFor="confirm-pin" className="px-2 text-[var(--cord-dim)]">Confirme</Label>
                <Input id="confirm-pin" type="password" inputMode="numeric" className="h-14 rounded-full px-6 text-base"
                  value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} />
              </div>
              <button type="submit" data-primary className="cord-button h-[52px] w-full gap-2 text-base" disabled={busy || !pin}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Créer le coffre
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

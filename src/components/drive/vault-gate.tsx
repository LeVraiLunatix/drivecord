"use client";

import * as React from "react";
import { authFetch, apiFetcher as fetcher } from "@/lib/api-base";
import useSWR from "swr";
import { Lock, ShieldCheck, Loader2, KeyRound, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { biometryAvailable, runBiometric } from "@/lib/biometric";
import {
  deriveVaultKey,
  deriveVaultKeyRaw,
  generateMasterKeyBytes,
  importMasterKey,
  randomSaltB64,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto/vault-crypto";
import { setVaultKey } from "@/lib/crypto/vault-key-store";

/**
 * Opportunistically upgrade a legacy vault (PIN+salt derived the file key
 * directly) to the wrapped-master-key scheme, so a future PIN change no
 * longer breaks decryption of existing files. Best-effort: failures are
 * swallowed since the vault still works with the legacy key either way.
 */
async function migrateLegacyVaultKey(pin: string, masterRaw: Uint8Array): Promise<void> {
  const salt = randomSaltB64();
  const kek = await deriveVaultKey(pin, salt);
  const { wrapped, iv } = await wrapMasterKey(masterRaw, kek);
  await authFetch("/api/account/vault-pin", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPin: pin, newPin: pin, salt, wrappedKey: wrapped, wrappedKeyIv: iv }),
  });
}


/**
 * Locks the vault section behind a PIN. Shows a create-PIN form if none exists,
 * otherwise a PIN entry. Calls `onUnlock` once the correct PIN is entered.
 */
export function VaultGate({ onUnlock }: { onUnlock: () => void }) {
  const { data, isLoading, mutate } = useSWR<{ hasPin: boolean }>(
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

  const tryBiometric = React.useCallback(async () => {
    const ok = await runBiometric();
    if (ok) onUnlock();
  }, [onUnlock]);

  // Once we know a PIN exists and biometrics are available, offer Face ID first.
  React.useEffect(() => {
    if (data?.hasPin && bioAvailable) void tryBiometric();
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
      const masterRaw = generateMasterKeyBytes();
      const salt = randomSaltB64();
      const kek = await deriveVaultKey(pin, salt);
      const { wrapped, iv } = await wrapMasterKey(masterRaw, kek);
      const res = await authFetch("/api/account/vault-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPin: pin, salt, wrappedKey: wrapped, wrappedKeyIv: iv }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Échec");
      setVaultKey(await importMasterKey(masterRaw));
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
      const res = await authFetch("/api/account/vault-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const d = await res.json();
      if (d.ok) {
        if (d.wrappedKey && d.wrappedKeyIv && d.salt) {
          const kek = await deriveVaultKey(pin, d.salt);
          setVaultKey(await unwrapMasterKey(d.wrappedKey, d.wrappedKeyIv, kek));
        } else if (d.salt) {
          // Legacy vault created before the wrapped-master-key scheme.
          const masterRaw = await deriveVaultKeyRaw(pin, d.salt);
          setVaultKey(await importMasterKey(masterRaw));
          void migrateLegacyVaultKey(pin, masterRaw);
        } else {
          throw new Error("Clé de coffre indisponible.");
        }
        onUnlock();
      } else { toast.error("Code incorrect"); setPin(""); }
    } catch (err) { toast.error((err as Error).message ?? "Erreur"); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xs space-y-5 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30">
          <Lock className="size-7" />
        </div>

        {data.hasPin ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Coffre-fort verrouillé</h2>
              <p className="text-sm text-muted-foreground">Entre ton code pour accéder à tes fichiers protégés.</p>
            </div>
            <form onSubmit={verifyPin} className="space-y-3">
              <Input
                type="password" inputMode="numeric" autoFocus
                value={pin} onChange={(e) => setPin(e.target.value)}
                placeholder="Code" className="text-center tracking-[0.3em]"
              />
              <Button type="submit" className="w-full gap-2" disabled={busy || !pin}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Déverrouiller
              </Button>
              {bioAvailable && (
                <Button type="button" variant="outline" className="w-full gap-2" onClick={tryBiometric}>
                  <Fingerprint className="size-4" />
                  Face ID / Touch ID
                </Button>
              )}
            </form>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Crée ton coffre-fort</h2>
              <p className="text-sm text-muted-foreground">Choisis un code (4 à 12 chiffres) pour protéger tes fichiers sensibles.</p>
            </div>
            <form onSubmit={createPin} className="space-y-3">
              <div className="space-y-1.5 text-left">
                <Label htmlFor="pin">Nouveau code</Label>
                <Input id="pin" type="password" inputMode="numeric" autoFocus
                  value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4 à 12 chiffres" />
              </div>
              <div className="space-y-1.5 text-left">
                <Label htmlFor="confirm-pin">Confirme</Label>
                <Input id="confirm-pin" type="password" inputMode="numeric"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={busy || !pin}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Créer le coffre
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

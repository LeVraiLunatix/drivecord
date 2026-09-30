"use client";

import * as React from "react";
import { KeyRound, Loader2, Lock, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trustThisDevice, unlockPasskey, unlockPhrase, unlockRecovery } from "@/lib/e2ee-client/keyring";
import { passkeysAvailable } from "@/lib/e2ee-client/passkey-prf";
import { requestKeyTransfer } from "@/lib/e2ee-client/transfer";
import { useKeyring } from "./use-keyring";

type Mode = "menu" | "phrase" | "recovery" | "device";

/** "Déverrouille ton stockage": passkey → phrase → recovery key → approval from another device. */
export function UnlockScreen() {
  const { bundle } = useKeyring();
  const [mode, setMode] = React.useState<Mode>("menu");
  const [value, setValue] = React.useState("");
  const [trust, setTrust] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [code, setCode] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  const hasPasskey = bundle && Object.keys(bundle.mkWrappedPasskey).length > 0 && passkeysAvailable();
  const hasPhrase = Boolean(bundle?.mkWrappedPhrase);

  React.useEffect(() => () => abort.current?.abort(), []);

  // A successful unlock flips the keyring to "unlocked" (which unmounts this screen), so the
  // "trust this device" choice must be applied right after, from here.
  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true);
    setError("");
    try {
      const ok = await fn();
      if (ok === false) {
        setError("Cette passkey ne permet pas le déverrouillage sur ce navigateur. Utilise ta phrase ou ta clé de récupération.");
        return;
      }
      if (trust) await trustThisDevice().catch(() => {});
    } catch (e) {
      const msg = (e as Error).message;
      setError(/Déchiffrement impossible/.test(msg) ? "Mauvais secret. Vérifie ce que tu as saisi." : msg);
    } finally {
      setBusy(false);
    }
  };

  const startTransfer = async () => {
    setMode("device");
    setError("");
    setCode(null);
    abort.current?.abort();
    abort.current = new AbortController();
    try {
      await requestKeyTransfer(navigator.userAgent.includes("Mobile") ? "Mobile" : "Navigateur", {
        onCode: setCode,
        signal: abort.current.signal,
      });
      if (trust) await trustThisDevice().catch(() => {});
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setMode("menu");
      }
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6" data-testid="unlock-screen">
          <div className="flex items-center gap-3">
            <Lock className="size-7 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Déverrouille ton stockage</h1>
              <p className="text-sm text-muted-foreground">Tes fichiers sont chiffrés de bout en bout : il faut ta clé pour les lire.</p>
            </div>
          </div>

          {mode === "menu" && (
            <div className="space-y-2">
              {hasPasskey && (
                <Button className="w-full justify-start gap-2" onClick={() => run(unlockPasskey)} disabled={busy} data-testid="unlock-passkey">
                  <KeyRound className="size-4" /> Avec ma passkey
                </Button>
              )}
              {hasPhrase && (
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => { setMode("phrase"); setValue(""); setError(""); }} data-testid="unlock-phrase-btn">
                  <Lock className="size-4" /> Avec ma phrase de chiffrement
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => { setMode("recovery"); setValue(""); setError(""); }} data-testid="unlock-recovery-btn">
                <KeyRound className="size-4" /> Avec ma clé de récupération
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={startTransfer} data-testid="unlock-device-btn">
                <Smartphone className="size-4" /> Approuver depuis un autre appareil
              </Button>
            </div>
          )}

          {(mode === "phrase" || mode === "recovery") && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => (mode === "phrase" ? unlockPhrase(value) : unlockRecovery(value)));
              }}
            >
              <Label htmlFor="secret">{mode === "phrase" ? "Phrase de chiffrement" : "Clé de récupération"}</Label>
              <Input
                id="secret"
                data-testid="unlock-input"
                type={mode === "phrase" ? "password" : "text"}
                autoComplete={mode === "phrase" ? "current-password" : "off"}
                autoCapitalize="characters"
                placeholder={mode === "recovery" ? "XXXX-XXXX-XXXX-…" : ""}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setMode("menu")}>Retour</Button>
                <Button type="submit" className="flex-1" disabled={busy || !value.trim()} data-testid="unlock-submit">
                  {busy && <Loader2 className="size-4 animate-spin" />} Déverrouiller
                </Button>
              </div>
            </form>
          )}

          {mode === "device" && (
            <div className="space-y-3 text-center" data-testid="unlock-device">
              {code ? (
                <>
                  <p className="text-sm text-muted-foreground">Sur ton autre appareil déverrouillé, vérifie que ce code est <strong>identique</strong> puis approuve :</p>
                  <p className="font-mono text-4xl tracking-[0.3em]" data-testid="sas-code">{code}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Ouvre Drivecord sur un appareil déjà déverrouillé : une demande d&apos;approbation va y apparaître.</p>
              )}
              <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
              <Button variant="ghost" onClick={() => { abort.current?.abort(); setMode("menu"); setCode(null); }}>Annuler</Button>
            </div>
          )}

          {mode !== "device" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
              Faire confiance à cet appareil
            </label>
          )}
          {error && <p className="text-sm text-destructive" data-testid="unlock-error">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { ChevronDown, Fingerprint, Hash, KeyRound, Loader2, Lock, QrCode, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  trustThisDevice,
  unlockBiometric,
  unlockPasskey,
  unlockPhrase,
  unlockPin,
  unlockRecovery,
  unlockShares,
} from "@/lib/e2ee-client/keyring";
import { passkeysAvailable } from "@/lib/e2ee-client/passkey-prf";
import { requestKeyTransfer } from "@/lib/e2ee-client/transfer";
import { PIN_LENGTH } from "@/lib/crypto/e2ee/pin-policy";
import { useKeyring } from "./use-keyring";

type Mode = "menu" | "phrase" | "recovery" | "pin" | "shares" | "device";

/**
 * "Déverrouille ton stockage". The fastest method the account has (biometric lock of this device,
 * then passkey) is one big button; PIN, approval from another device (QR code / notification),
 * passphrase, recovery key and recovery shares sit under "Autres méthodes" — open straight away
 * when there is no fast method.
 */
export function UnlockScreen() {
  const { bundle, deviceBio } = useKeyring();
  const [mode, setMode] = React.useState<Mode>("menu");
  const [value, setValue] = React.useState("");
  const [trust, setTrust] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [code, setCode] = React.useState<string | null>(null);
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const [qrImage, setQrImage] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  const hasBio = deviceBio;
  const hasPasskey = Boolean(bundle && Object.keys(bundle.mkWrappedPasskey).length > 0 && passkeysAvailable());
  const hasPin = Boolean(bundle?.hasPin);
  const hasPhrase = Boolean(bundle?.mkWrappedPhrase);
  const shares = bundle?.mkWrappedShares ? bundle.sharesMeta : null;
  const fast = hasBio || hasPasskey;
  const [showOthers, setShowOthers] = React.useState(!fast);

  React.useEffect(() => () => abort.current?.abort(), []);

  React.useEffect(() => {
    if (!qrUrl) return;
    let cancelled = false;
    void import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(qrUrl, { margin: 1, width: 224, errorCorrectionLevel: "M" }).then((img) => !cancelled && setQrImage(img)),
    );
    return () => { cancelled = true; };
  }, [qrUrl]);

  const open = (m: Mode) => { setMode(m); setValue(""); setError(""); };

  // A successful unlock flips the keyring to "unlocked" (which unmounts this screen), so the
  // "trust this device" choice must be applied right after, from here.
  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true);
    setError("");
    try {
      const ok = await fn();
      if (ok === false) {
        setError("Cette passkey ne permet pas le déverrouillage sur ce navigateur. Utilise une autre méthode.");
        setShowOthers(true);
        return;
      }
      if (trust) await trustThisDevice().catch(() => {});
    } catch (e) {
      const err = e as Error;
      if (err.name === "NotAllowedError") {
        // Prompt dismissed or timed out: not an error worth shouting about.
        setError("Déverrouillage annulé. Appuie sur le bouton pour réessayer.");
        return;
      }
      setError(/Déchiffrement impossible/.test(err.message) ? "Mauvais secret. Vérifie ce que tu as saisi." : err.message);
      if (mode === "pin") setValue("");
    } finally {
      setBusy(false);
    }
  };

  const startTransfer = async () => {
    setMode("device");
    setError("");
    setCode(null);
    setQrUrl(null);
    setQrImage(null);
    abort.current?.abort();
    abort.current = new AbortController();
    try {
      await requestKeyTransfer(navigator.userAgent.includes("Mobile") ? "Mobile" : "Navigateur", {
        onCode: setCode,
        onQr: setQrUrl,
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

  const cancelTransfer = () => { abort.current?.abort(); setMode("menu"); setCode(null); setQrUrl(null); setQrImage(null); };

  const parsedShares = value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

  const other = (variant: "outline" | "default" = "outline") => ({ variant, className: "w-full justify-start gap-2" } as const);

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
            <div className="space-y-3">
              {hasBio && (
                <Button size="lg" className="h-12 w-full gap-2 text-base" onClick={() => run(unlockBiometric)} disabled={busy} data-testid="unlock-biometric">
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <Fingerprint className="size-5" />}
                  Déverrouiller avec la biométrie
                </Button>
              )}
              {hasPasskey && (
                <Button
                  size="lg"
                  variant={hasBio ? "outline" : "default"}
                  className="h-12 w-full gap-2 text-base"
                  onClick={() => run(unlockPasskey)}
                  disabled={busy}
                  data-testid="unlock-passkey"
                >
                  {busy && !hasBio ? <Loader2 className="size-5 animate-spin" /> : <Fingerprint className="size-5" />}
                  Déverrouiller avec ma passkey
                </Button>
              )}
              {fast && !showOthers ? (
                <button
                  type="button"
                  className="mx-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setShowOthers(true)}
                  data-testid="unlock-others-btn"
                >
                  Autres méthodes <ChevronDown className="size-4" />
                </button>
              ) : (
                <div className="space-y-2">
                  {hasPin && (
                    <Button {...other(fast ? "outline" : "default")} onClick={() => open("pin")} data-testid="unlock-pin-btn">
                      <Hash className="size-4" /> Avec mon code PIN
                    </Button>
                  )}
                  <Button {...other(fast || hasPin ? "outline" : "default")} onClick={startTransfer} data-testid="unlock-device-btn">
                    <QrCode className="size-4" /> Approuver depuis un autre appareil (QR code)
                  </Button>
                  {hasPhrase && (
                    <Button {...other()} onClick={() => open("phrase")} data-testid="unlock-phrase-btn">
                      <Lock className="size-4" /> Avec ma phrase de chiffrement
                    </Button>
                  )}
                  <Button {...other()} onClick={() => open("recovery")} data-testid="unlock-recovery-btn">
                    <KeyRound className="size-4" /> Avec ma clé de récupération
                  </Button>
                  {shares && (
                    <Button {...other()} onClick={() => open("shares")} data-testid="unlock-shares-btn">
                      <Users className="size-4" /> Avec les parts de mes proches ({shares.k} sur {shares.n})
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === "pin" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (value.length === PIN_LENGTH) void run(() => unlockPin(value));
              }}
            >
              <Label htmlFor="pin">Code PIN</Label>
              <Input
                id="pin"
                data-testid="unlock-pin-input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={PIN_LENGTH}
                autoComplete="off"
                className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
                value={value}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
                  setValue(v);
                  // The last digit submits: no button to hunt for.
                  if (v.length === PIN_LENGTH && !busy) void run(() => unlockPin(v));
                }}
                disabled={busy}
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => open("menu")}>Retour</Button>
                <Button type="submit" className="flex-1" disabled={busy || value.length !== PIN_LENGTH} data-testid="unlock-submit">
                  {busy && <Loader2 className="size-4 animate-spin" />} Déverrouiller
                </Button>
              </div>
            </form>
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
                <Button type="button" variant="ghost" onClick={() => open("menu")}>Retour</Button>
                <Button type="submit" className="flex-1" disabled={busy || !value.trim()} data-testid="unlock-submit">
                  {busy && <Loader2 className="size-4 animate-spin" />} Déverrouiller
                </Button>
              </div>
            </form>
          )}

          {mode === "shares" && shares && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => unlockShares(parsedShares));
              }}
            >
              <Label htmlFor="shares">Parts de récupération ({parsedShares.length}/{shares.k})</Label>
              <p className="text-xs text-muted-foreground">Demande {shares.k} parts à tes proches et colle-les ici, une par ligne.</p>
              <textarea
                id="shares"
                data-testid="unlock-shares-input"
                rows={4}
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={"XXXX-XXXX-XXXX-…\nXXXX-XXXX-XXXX-…"}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => open("menu")}>Retour</Button>
                <Button type="submit" className="flex-1" disabled={busy || parsedShares.length < shares.k} data-testid="unlock-submit">
                  {busy && <Loader2 className="size-4 animate-spin" />} Déverrouiller
                </Button>
              </div>
            </form>
          )}

          {mode === "device" && (
            <div className="space-y-3 text-center" data-testid="unlock-device">
              {qrImage ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Sur ton téléphone déjà déverrouillé, <strong>scanne ce QR code</strong> avec l&apos;appareil photo, puis touche « Approuver ».
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrImage} alt="QR code d'approbation" width={224} height={224} className="mx-auto rounded-lg bg-white p-1" data-testid="unlock-qr" />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Ouvre Drivecord sur un appareil déjà déverrouillé : une demande d&apos;approbation va y apparaître.</p>
              )}
              {code && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pas de QR code ? Sur l&apos;autre appareil, ouvre la demande et vérifie que ce code est <strong>identique</strong> :</p>
                  <p className="font-mono text-3xl tracking-[0.3em]" data-testid="sas-code">{code}</p>
                </div>
              )}
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Smartphone className="size-3.5" /> Tes autres appareils sont prévenus par notification s'ils l'ont activée.
              </p>
              <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
              <Button variant="ghost" onClick={cancelTransfer}>Annuler</Button>
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

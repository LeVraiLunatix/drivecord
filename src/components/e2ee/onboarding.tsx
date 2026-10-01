"use client";

import * as React from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  commitAccountKeys,
  enrollPasskey,
  prepareAccountKeys,
  trustThisDevice,
  type PreparedKeys,
} from "@/lib/e2ee-client/keyring";
import { passkeysAvailable } from "@/lib/e2ee-client/passkey-prf";
import { useKeyring } from "./use-keyring";
import { RecoveryKeyDisplay } from "./recovery-key-display";

/** Three distinct random positions (0-based) out of the 13 groups, sorted. */
function pickChecks(): number[] {
  const all = Array.from({ length: 13 }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, 3).sort((a, b) => a - b);
}

type Step = "intro" | "recovery" | "verify" | "done";

/**
 * First-time setup. Keys are created in memory, the recovery key is shown and the user must
 * retype three of its groups BEFORE anything is stored — no account ends up with keys nobody can open.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { passkeys } = useKeyring();
  const [step, setStep] = React.useState<Step>("intro");
  const [phrase, setPhrase] = React.useState("");
  const [phrase2, setPhrase2] = React.useState("");
  const [prepared, setPrepared] = React.useState<PreparedKeys | null>(null);
  const [checks] = React.useState(pickChecks);
  const [answers, setAnswers] = React.useState<string[]>(["", "", ""]);
  const [trust, setTrust] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const phraseOk = phrase === "" || (phrase.length >= 8 && phrase === phrase2);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      setPrepared(await prepareAccountKeys({ phrase: phrase || undefined }));
      setStep("recovery");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!prepared) return;
    const ok = checks.every((idx, i) => answers[i]!.trim().toUpperCase() === prepared.recovery.groups[idx]);
    if (!ok) return setError("Ces groupes ne correspondent pas à ta clé. Vérifie ta copie.");
    setBusy(true);
    setError("");
    try {
      await commitAccountKeys(prepared);
      if (trust) await trustThisDevice().catch(() => {});
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addPasskey = async () => {
    setBusy(true);
    try {
      const ok = await enrollPasskey(passkeys[0]!.credentialId);
      toast[ok ? "success" : "error"](ok ? "Passkey ajoutée pour le déverrouillage." : "Cette passkey ne supporte pas le déverrouillage (PRF).");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-5 p-6" data-testid={`onboarding-${step}`}>
          {step === "intro" && (
            <>
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-8 text-primary" />
                <div>
                  <h1 className="text-xl font-semibold">Chiffre tes fichiers de bout en bout</h1>
                  <p className="text-sm text-muted-foreground">Ni Drivecord, ni Discord, ni une fuite de base de données ne pourront lire tes fichiers ni leurs noms.</p>
                </div>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Une clé secrète est créée sur cet appareil ; elle ne quitte jamais tes appareils en clair.</li>
                <li>Tu recevras une <strong>clé de récupération</strong> à conserver : sans elle (ou un autre moyen de déverrouillage), perdre tes appareils = perdre tes fichiers.</li>
              </ul>
              <div className="space-y-2">
                <Label htmlFor="phrase">Phrase de chiffrement (recommandé, optionnelle)</Label>
                <Input id="phrase" type="password" autoComplete="new-password" placeholder="8 caractères minimum" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
                {phrase !== "" && (
                  <Input type="password" autoComplete="new-password" placeholder="Confirme la phrase" value={phrase2} onChange={(e) => setPhrase2(e.target.value)} />
                )}
                <p className="text-xs text-muted-foreground">Elle permet de déverrouiller sur un nouvel appareil sans passkey. Elle n&apos;est jamais envoyée au serveur.</p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={create} disabled={busy || !phraseOk}>
                {busy && <Loader2 className="size-4 animate-spin" />} Continuer
              </Button>
            </>
          )}

          {step === "recovery" && prepared && (
            <>
              <div className="flex items-center gap-3">
                <KeyRound className="size-7 text-primary" />
                <h1 className="text-xl font-semibold">Ta clé de récupération</h1>
              </div>
              <p className="text-sm text-muted-foreground">Elle ne sera <strong>plus jamais affichée</strong>. Note-la ou enregistre-la dans un gestionnaire de mots de passe, hors de cet ordinateur.</p>
              <RecoveryKeyDisplay groups={prepared.recovery.groups} />
              <Button className="w-full" onClick={() => setStep("verify")}>Je l&apos;ai enregistrée</Button>
            </>
          )}

          {step === "verify" && prepared && (
            <>
              <h1 className="text-xl font-semibold">Vérifions ta copie</h1>
              <p className="text-sm text-muted-foreground">Recopie ces trois groupes de ta clé :</p>
              <div className="grid grid-cols-3 gap-3">
                {checks.map((idx, i) => (
                  <div key={idx} className="space-y-1">
                    <Label htmlFor={`g${idx}`}>Groupe {idx + 1}</Label>
                    <Input
                      id={`g${idx}`}
                      data-testid={`verify-${idx + 1}`}
                      autoComplete="off"
                      maxLength={4}
                      className="text-center font-mono uppercase"
                      value={answers[i]}
                      onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
                Faire confiance à cet appareil (déverrouillage automatique)
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep("recovery")}>Retour</Button>
                <Button className="flex-1" onClick={verify} disabled={busy || answers.some((a) => a.trim().length < 4)}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Terminer
                </Button>
              </div>
            </>
          )}

          {step === "done" && (
            <>
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-8 text-emerald-500" />
                <h1 className="text-xl font-semibold">C&apos;est prêt</h1>
              </div>
              <p className="text-sm text-muted-foreground">Tes fichiers sont désormais chiffrés de bout en bout.</p>
              {passkeys.length > 0 && passkeysAvailable() && (
                <Button variant="outline" className="w-full gap-2" onClick={addPasskey} disabled={busy}>
                  <KeyRound className="size-4" /> Utiliser ma passkey pour déverrouiller (optionnel)
                </Button>
              )}
              <Button className="w-full" onClick={onDone} data-testid="onboarding-finish">Ouvrir mon drive</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { Copy, KeyRound, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DiscordClient } from "@/lib/discord";
import { useAllDrives, type Drive } from "@/lib/storage";
import {
  enrollPasskey,
  forgetThisDevice,
  regenerateRecoveryKey,
  removePasskey,
  removePassphrase,
  setPassphrase,
  trustThisDevice,
} from "@/lib/e2ee-client/keyring";
import { passkeysAvailable } from "@/lib/e2ee-client/passkey-prf";
import { getDriveKeyMaterialById } from "@/lib/e2ee-client/drive-keys";
import { driveKeyToHex } from "@/lib/e2ee-client/drive-key-export";
import { convertFileToE2ee, listWholeDrive, needsConversion, rotateDriveKey, type RotationProgress } from "@/lib/e2ee-client/convert";
import { RecoveryKeyDisplay } from "./recovery-key-display";
import { useKeyring } from "./use-keyring";

/** Réglages › Chiffrement de bout en bout : moyens de déverrouillage, clé de récupération, drives. */
export function EncryptionSettings() {
  const k = useKeyring();
  const drives = useAllDrives();

  if (k.status !== "unlocked") {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Lock className="size-4" /> Déverrouille ton stockage (depuis le drive) pour gérer le chiffrement.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="encryption-settings">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-emerald-500" />
          Chiffrement de bout en bout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Tes fichiers et leurs noms sont chiffrés sur tes appareils. Le serveur ne détient aucune clé capable de les lire.
        </p>
        <DeviceTrust trusted={k.trusted} />
        <Passphrase enabled={Boolean(k.bundle?.mkWrappedPhrase)} />
        <Passkeys passkeys={k.passkeys} enrolled={Object.keys(k.bundle?.mkWrappedPasskey ?? {})} />
        <RecoveryKey />
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Drives</h3>
          {(drives ?? []).map((d) => <DriveCrypto key={d.id} drive={d} />)}
          {(drives ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucun drive connecté.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function useAction() {
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function DeviceTrust({ trusted }: { trusted: boolean }) {
  const { busy, run } = useAction();
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-medium">Cet appareil</h3>
        <p className="text-xs text-muted-foreground">{trusted ? "De confiance : déverrouillage automatique." : "Pas de confiance : il faudra te déverrouiller à chaque session."}</p>
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(trusted ? forgetThisDevice : trustThisDevice, trusted ? "Appareil oublié." : "Appareil de confiance.")}>
        {trusted ? "Ne plus faire confiance" : "Faire confiance"}
      </Button>
    </div>
  );
}

function Passphrase({ enabled }: { enabled: boolean }) {
  const { busy, run } = useAction();
  const [open, setOpen] = React.useState(false);
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const ok = a.length >= 8 && a === b;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Phrase de chiffrement {enabled && <Badge variant="secondary" className="ml-1">active</Badge>}</h3>
          <p className="text-xs text-muted-foreground">Déverrouille sur un nouvel appareil, sans passkey. Jamais envoyée au serveur.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>{enabled ? "Changer" : "Définir"}</Button>
          {enabled && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(removePassphrase, "Phrase supprimée.")}>Supprimer</Button>}
        </div>
      </div>
      {open && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => { await setPassphrase(a); setOpen(false); setA(""); setB(""); }, "Phrase enregistrée.");
          }}
        >
          <Input type="password" autoComplete="new-password" placeholder="Nouvelle phrase (8 caractères min.)" value={a} onChange={(e) => setA(e.target.value)} />
          <Input type="password" autoComplete="new-password" placeholder="Confirme" value={b} onChange={(e) => setB(e.target.value)} />
          <Button size="sm" type="submit" disabled={busy || !ok}>{busy && <Loader2 className="size-4 animate-spin" />} Enregistrer</Button>
        </form>
      )}
    </div>
  );
}

function Passkeys({ passkeys, enrolled }: { passkeys: { credentialId: string; name: string }[]; enrolled: string[] }) {
  const { busy, run } = useAction();
  if (passkeys.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium">Passkeys</h3>
        <p className="text-xs text-muted-foreground">Ajoute d&apos;abord une passkey dans la section Sécurité pour pouvoir déverrouiller avec.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Déverrouiller avec une passkey</h3>
      {passkeys.map((p) => {
        const on = enrolled.includes(p.credentialId);
        return (
          <div key={p.credentialId} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm"><KeyRound className="size-4 text-muted-foreground" />{p.name}{on && <Badge variant="secondary">active</Badge>}</span>
            {on ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => removePasskey(p.credentialId), "Passkey retirée du déverrouillage.")}>Retirer</Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !passkeysAvailable()}
                onClick={() => run(async () => { if (!(await enrollPasskey(p.credentialId))) throw new Error("Cette passkey ne supporte pas le déverrouillage (extension PRF)."); }, "Passkey activée pour le déverrouillage.")}
              >
                Activer
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecoveryKey() {
  const { busy, run } = useAction();
  const [fresh, setFresh] = React.useState<string[] | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Clé de récupération</h3>
          <p className="text-xs text-muted-foreground">En générer une nouvelle invalide l&apos;ancienne.</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => setFresh((await regenerateRecoveryKey()).groups))}>
          Régénérer
        </Button>
      </div>
      {fresh && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Nouvelle clé — <strong>affichée une seule fois</strong> :</p>
          <RecoveryKeyDisplay groups={fresh} />
          <Button size="sm" onClick={() => setFresh(null)}>Je l&apos;ai enregistrée</Button>
        </div>
      )}
    </div>
  );
}

function DriveCrypto({ drive }: { drive: Drive }) {
  const [progress, setProgress] = React.useState<string | null>(null);
  const [plainCount, setPlainCount] = React.useState<number | null>(null);
  const [exportedKey, setExportedKey] = React.useState<string | null>(null);
  const { busy, run } = useAction();
  const e2ee = (drive.e2eeVersion ?? 0) >= 1;

  // The key never stays on screen: it hides itself after a minute.
  React.useEffect(() => {
    if (!exportedKey) return;
    const timer = setTimeout(() => setExportedKey(null), 60_000);
    return () => clearTimeout(timer);
  }, [exportedKey]);
  const client = React.useMemo(() => DiscordClient.fromUrl(drive.webhookUrl), [drive.webhookUrl]);

  const label = (p: RotationProgress) =>
    p.phase === "convert" ? `Rechiffrement ${p.done}/${p.total}…` : p.phase === "rewrap" ? `Nouvelle clé ${p.done}/${p.total}…` : "Finalisation…";

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{drive.name}</span>
        <Badge variant={e2ee ? "secondary" : "destructive"}>{e2ee ? "de bout en bout" : "ancien chiffrement"}</Badge>
      </div>
      {e2ee && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(async () => {
              const { files } = await listWholeDrive(drive.id);
              setPlainCount(files.filter(needsConversion).length);
            })}
          >
            <RefreshCw className="size-3.5" /> Analyser
          </Button>
          {plainCount !== null && plainCount > 0 && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(async () => {
                const { files } = await listWholeDrive(drive.id);
                const todo = files.filter(needsConversion);
                for (let i = 0; i < todo.length; i++) {
                  setProgress(`Chiffrement ${i + 1}/${todo.length}…`);
                  await convertFileToE2ee(client, drive.id, todo[i]!);
                }
                setProgress(null);
                setPlainCount(0);
              }, "Fichiers chiffrés.")}
            >
              Chiffrer maintenant ({plainCount})
            </Button>
          )}
          {plainCount === 0 && <span className="text-xs text-muted-foreground">Tous les fichiers sont chiffrés.</span>}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!confirm("Renouveler la clé de ce drive ? Elle n'existera plus que sur tes appareils. Cela peut prendre du temps sur un gros drive.")) return;
              void run(async () => {
                await rotateDriveKey(client, drive.id, (p) => setProgress(label(p)));
                setProgress(null);
                setExportedKey(null);
              }, "Clé du drive renouvelée.");
            }}
          >
            Renouveler la clé
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!confirm("Cette clé déchiffre tous les fichiers de ce drive. Ne la montre à personne et ne la colle que dans la configuration de ton propre serveur. Afficher la clé ?")) return;
              void run(async () => setExportedKey(driveKeyToHex((await getDriveKeyMaterialById(drive.id)).raw)));
            }}
          >
            <KeyRound className="size-3.5" /> Exporter la clé
          </Button>
        </div>
      )}
      {exportedKey && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3" data-testid="exported-drive-key">
          <p className="text-xs font-medium">Clé du drive « {drive.name} » : elle se masque toute seule dans une minute.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-background/60 px-2 py-1.5 font-mono text-[11px]">{exportedKey}</code>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label="Copier la clé"
              onClick={() => {
                navigator.clipboard.writeText(exportedKey).then(
                  () => toast.success("Copié."),
                  () => toast.error("Impossible de copier : sélectionne la clé à la main."),
                );
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            À coller dans la variable <code>DRIVECORD_DRIVE_KEY</code> de ton serveur (64 caractères hexadécimaux, pour <code>@drivecord/node</code>).
            Ce n&apos;est pas la clé de récupération. Si tu renouvelles la clé du drive, il faudra exporter la nouvelle.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setExportedKey(null)}>Masquer</Button>
        </div>
      )}
      {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
      <p className="text-[11px] text-muted-foreground">
        Avant le chiffrement de bout en bout, la clé de ce drive a existé sur nos serveurs. La renouveler lui donne une clé que le serveur n&apos;a jamais connue.
      </p>
    </div>
  );
}

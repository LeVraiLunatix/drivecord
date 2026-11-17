"use client";

import * as React from "react";
import { authFetch } from "@/lib/api-base";
import { publicOrigin } from "@/lib/site-link";
import { Copy, Check, Link2, Loader2, Lock, Trash2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format";
import type { DriveItem, FileEntry } from "@/lib/storage";
import { b64urlEncode, wrapFileKeyForShare } from "@/lib/crypto/e2ee";
import { getDriveKeyMaterialById } from "@/lib/e2ee-client/drive-keys";
import { getFileCipher, isE2eeFile } from "@/lib/e2ee-client/file-crypto";
import { convertFileToE2ee } from "@/lib/e2ee-client/convert";
import { DiscordClient } from "@/lib/discord";
import { getDrive } from "@/lib/storage";

type ShareInfo = { token: string; hasPassword: boolean; expiresAt: number | null };

const EXPIRY_OPTIONS = [
  { label: "Jamais", days: 0 },
  { label: "1 jour", days: 1 },
  { label: "7 jours", days: 7 },
  { label: "30 jours", days: 30 },
];

export function ShareDialog({
  item,
  onOpenChange,
}: {
  item: DriveItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = item !== null;
  const [share, setShare] = React.useState<ShareInfo | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [expiryDays, setExpiryDays] = React.useState(0);

  const fileId = item?.kind === "file" ? item.id : null;
  const driveId = item?.driveId ?? null;
  const file: FileEntry | null = item?.kind === "file" ? item : null;
  const e2ee = file ? isE2eeFile(file) : false;
  // Legacy single-IV file: its key IS the drive key — it can't be shared as is, it must be re-encrypted first.
  const legacyEncrypted = Boolean(file && !e2ee && file.encIv);
  // The file key rides in the URL FRAGMENT (`#k=`): browsers never send it to any server.
  const [fragmentKey, setFragmentKey] = React.useState<string | null>(null);
  const [converting, setConverting] = React.useState(false);

  React.useEffect(() => {
    setFragmentKey(null);
    if (!open || !file || !driveId || !isE2eeFile(file)) return;
    let ignore = false;
    getDriveKeyMaterialById(driveId)
      .then((dk) => getFileCipher(dk, file))
      .then((p) => { if (!ignore) setFragmentKey(b64urlEncode(p.raw)); })
      .catch(() => {});
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fileId, driveId]);

  React.useEffect(() => {
    if (!open || !fileId || !driveId) return;
    let ignore = false;
    setShare(null); setPassword(""); setExpiryDays(0); setCopied(false);
    setLoading(true);
    authFetch(`/api/drive/${driveId}/files/${fileId}/share`)
      .then((r) => r.json())
      .then((d) => { if (!ignore) setShare(d.share ?? null); })
      .catch(() => {})
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [open, fileId, driveId]);

  // Password-protected E2EE shares carry no key in the link: the password unwraps it.
  const shareUrl = share
    ? `${publicOrigin()}/s/${share.token}${e2ee && !share.hasPassword && fragmentKey ? `#k=${fragmentKey}` : ""}`
    : "";

  const convertThenClose = async () => {
    if (!file || !driveId) return;
    setConverting(true);
    try {
      const drive = await getDrive(driveId);
      if (!drive) throw new Error("Drive introuvable.");
      await convertFileToE2ee(DiscordClient.fromUrl(drive.webhookUrl), driveId, file);
      toast.success("Fichier rechiffré. Rouvre « Partager » pour créer le lien.");
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setConverting(false); }
  };

  const createOrUpdate = async () => {
    if (!fileId || !driveId) return;
    setBusy(true);
    try {
      let body: Record<string, unknown> = { password: password || undefined, expiresInDays: expiryDays || null };
      if (e2ee && file) {
        // The server never sees the password: it stores the file key wrapped by Argon2id(password).
        const token = nanoid(24);
        body = { token, expiresInDays: expiryDays || null };
        if (password) {
          const p = await getFileCipher(await getDriveKeyMaterialById(driveId), file);
          const w = await wrapFileKeyForShare(p.raw, token, password);
          body = { ...body, fkWrappedForShare: w.blob, shareKdf: w.kdf };
        }
      }
      const res = await authFetch(`/api/drive/${driveId}/files/${fileId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Échec");
      setShare({ token: d.token, hasPassword: d.hasPassword, expiresAt: d.expiresAt });
      toast.success("Lien de partage créé 🔗");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!fileId || !driveId) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/drive/${driveId}/files/${fileId}/share`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setShare(null); setPassword(""); setExpiryDays(0);
      toast.success("Lien révoqué");
    } catch { toast.error("Échec de la révocation"); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  const fileName = item?.kind === "file" ? item.filename : "";
  const note = e2ee && (
    <div className="cord-note flex gap-3 text-sm text-[var(--cord-dim)]">
      <Lock className="mt-0.5 size-4 shrink-0 text-[var(--cord-light-mid)]" />
      <span>
        {share?.hasPassword || (!share && password)
          ? "Avec un mot de passe, le lien ne contient plus la clé : c'est le mot de passe qui la déverrouille."
          : <>La clé de déchiffrement reste dans le lien, après le <span className="font-mono">#</span> : les navigateurs ne l&apos;envoient jamais à un serveur.</>}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[34rem]">
        <DialogHeader className="gap-2 pr-10">
          <DialogTitle className="cord-display text-[clamp(1.75rem,5vw,2.25rem)] leading-[1.05]">
            Partager
            <span className="block break-words" title={fileName}>{fileName}</span>
          </DialogTitle>
          <DialogDescription className="text-[var(--cord-dim)]">
            {item?.kind === "file" ? formatBytes(item.size) : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : share ? (
          <div className="min-w-0 space-y-6">
            <div className="cord-glass flex h-16 w-full min-w-0 items-center gap-2 overflow-hidden rounded-full pl-6 pr-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--cord-dim)]">{shareUrl}</code>
              <button type="button" data-primary className="cord-button h-12 shrink-0 gap-2 px-5" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
            <div className="space-y-1 px-1">
              <p className="font-medium">
                {(() => {
                  if (!share.expiresAt) return "N'expire jamais";
                  // eslint-disable-next-line react-hooks/purity
                  const days = Math.ceil((share.expiresAt - Date.now()) / 86_400_000);
                  return days <= 0 ? "Expiré" : `Expire dans ${days} jour${days > 1 ? "s" : ""}`;
                })()}
              </p>
              <p className="text-sm text-[var(--cord-dim)]">{share.hasPassword ? "Protégé par un mot de passe" : "Sans mot de passe"}</p>
            </div>
            {note}
            <div className="flex items-center justify-between gap-3">
              <button type="button" className="cord-button h-12 gap-2 px-4 text-[var(--cord-light-warm)]" onClick={revoke} disabled={busy}>
                <Trash2 className="size-4" /> Désactiver le lien
              </button>
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="cord-button h-12 gap-2 px-5">
                Ouvrir <ExternalLink className="size-4" />
              </a>
            </div>
          </div>
        ) : legacyEncrypted ? (
          <div className="space-y-5">
            <p className="text-sm text-[var(--cord-dim)]">
              Ce fichier utilise l&apos;ancien format de chiffrement : pour le partager sans exposer la clé de tout ton drive, il doit d&apos;abord être rechiffré.
            </p>
            <button type="button" data-primary className="cord-button h-12 w-full gap-2" onClick={convertThenClose} disabled={converting}>
              {converting && <Loader2 className="size-4 animate-spin" />} Rechiffrer ce fichier
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="share-pw" className="px-2 text-[var(--cord-dim)]">Mot de passe (optionnel)</Label>
              <Input id="share-pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Laisser vide = public" autoComplete="off" className="h-14 rounded-full px-6 text-base" />
            </div>
            <div className="space-y-2">
              <Label className="px-2 text-[var(--cord-dim)]">Expiration</Label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {EXPIRY_OPTIONS.map((o) => (
                  <button
                    key={o.days}
                    type="button"
                    aria-pressed={expiryDays === o.days}
                    onClick={() => setExpiryDays(o.days)}
                    className={cn("cord-button h-12 px-3 text-sm", expiryDays === o.days && "ring-2 ring-[var(--cord-light-mid)]")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {note}
            <button type="button" data-primary className="cord-button h-[52px] w-full gap-2 text-base" onClick={createOrUpdate} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              Créer le lien
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

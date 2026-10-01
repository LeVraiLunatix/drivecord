"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Download, FileIcon, Flag, Lock, Loader2, CloudUpload, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/utils/format";
import {
  b64decode,
  b64urlDecode,
  decryptBlob as decryptE2eeBlob,
  decryptMeta,
  importAesKey,
  unwrapFileKeyFromShare,
  type FileMeta,
} from "@/lib/crypto/e2ee";

type Info = {
  encrypted?: boolean;
  e2eePassword?: boolean;
  encMeta?: string | null;
  fileId?: string | null;
  needsRegenerate?: boolean;
  exists: boolean;
  expired: boolean;
  hasPassword: boolean;
  filename: string | null;
  size: number | null;
  mimeType: string | null;
};

type E2eeManifest = {
  encrypted: true;
  fileId: string;
  noncePrefix: string;
  encMeta: string;
  size: number;
  chunks: { index: number; url: string }[];
};

type Manifest = {
  filename: string;
  size: number;
  mimeType: string;
  chunkSize: number;
  chunks: { index: number; url: string }[];
};

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = React.useState<Info | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState("");
  // End-to-end encrypted share: the file key comes from the URL fragment (never sent to a server)
  // or, for a password share, from the password. `meta` is the decrypted name/type/size.
  const [fk, setFk] = React.useState<Uint8Array | null>(null);
  const [meta, setMeta] = React.useState<FileMeta | null>(null);
  const [reporting, setReporting] = React.useState(false);
  const [reportReason, setReportReason] = React.useState("");
  const [reportSent, setReportSent] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/s/${token}`)
      .then((r) => r.json())
      .then((d) => setInfo(d))
      .catch(() => setInfo({ exists: false, expired: false, hasPassword: false, filename: null, size: null, mimeType: null }))
      .finally(() => setLoading(false));
  }, [token]);

  // Key from the fragment, then the metadata it unlocks.
  React.useEffect(() => {
    if (!info?.encrypted) return;
    const m = /(?:^|[#&])k=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    if (m) {
      try {
        setFk(b64urlDecode(m[1]!));
      } catch {
        setError("Le lien est incomplet ou abîmé.");
      }
    }
  }, [info?.encrypted]);

  React.useEffect(() => {
    if (!fk || !info?.encMeta || !info.fileId) return;
    let ignore = false;
    (async () => {
      try {
        const m = await decryptMeta(await importAesKey(fk), info.fileId!, info.encMeta!);
        if (!ignore) setMeta(m);
      } catch {
        if (!ignore) setError("Clé invalide : impossible de lire ce fichier.");
      }
    })();
    return () => { ignore = true; };
  }, [fk, info?.encMeta, info?.fileId]);

  const unlockWithPassword = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/s/${token}/key`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Échec");
      setFk(await unwrapFileKeyFromShare(d.fkWrappedForShare, d.shareKdf, token, password));
    } catch (e) {
      setError(/Déchiffrement impossible/.test((e as Error).message) ? "Mot de passe incorrect." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const sendReport = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: reportReason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Échec de l'envoi du signalement.");
      setReportSent(true);
      setReporting(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/s/${token}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Échec");
      }

      // Legacy encrypted files are decrypted server-side and returned as raw bytes.
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        triggerDownload(await res.blob(), info?.filename ?? "fichier");
        return;
      }

      const payload = (await res.json()) as Manifest | E2eeManifest;

      // End-to-end encrypted: the server sent ciphertext chunks only. Decrypt here, in the browser.
      if ("encrypted" in payload && payload.encrypted) {
        if (!fk) throw new Error("La clé de déchiffrement est absente du lien.");
        const ordered = [...payload.chunks].sort((a, b) => a.index - b.index);
        const parts: Blob[] = [];
        for (let i = 0; i < ordered.length; i++) {
          const r = await fetch(`/api/proxy?u=${encodeURIComponent(ordered[i]!.url)}`);
          if (!r.ok) throw new Error("Téléchargement interrompu");
          parts.push(await r.blob());
          setProgress(Math.round(((i + 1) / ordered.length) * 100));
        }
        const key = await importAesKey(fk);
        const m = await decryptMeta(key, payload.fileId, payload.encMeta);
        const plain = await decryptE2eeBlob(
          new Blob(parts),
          { fk: key, noncePrefix: b64decode(payload.noncePrefix), fileId: payload.fileId },
          m.mime,
        );
        triggerDownload(plain, m.name);
        return;
      }

      // Plaintext files come back as a manifest the browser fetches + assembles.
      const manifest = payload as Manifest;
      const ordered = [...manifest.chunks].sort((a, b) => a.index - b.index);
      const parts: Blob[] = [];
      for (let i = 0; i < ordered.length; i++) {
        const r = await fetch(`/api/proxy?u=${encodeURIComponent(ordered[i].url)}`);
        if (!r.ok) throw new Error("Téléchargement interrompu");
        parts.push(await r.blob());
        setProgress(Math.round(((i + 1) / ordered.length) * 100));
      }
      triggerDownload(
        new Blob(parts, { type: manifest.mimeType || "application/octet-stream" }),
        manifest.filename,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <CloudUpload className="size-5 text-white" />
          </span>
          <span className="font-mono text-lg font-semibold">drivecord</span>
        </Link>

        {loading ? (
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        ) : info?.needsRegenerate ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-8">
            <AlertCircle className="size-9 text-amber-500" />
            <p className="font-medium">Lien à régénérer</p>
            <p className="text-sm text-muted-foreground">
              Le chiffrement de ce fichier a été renforcé : son propriétaire doit recréer le lien de partage.
            </p>
          </div>
        ) : !info?.exists || info.expired ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-8">
            <AlertCircle className="size-9 text-destructive" />
            <p className="font-medium">{info?.expired ? "Lien expiré" : "Lien introuvable"}</p>
            <p className="text-sm text-muted-foreground">
              {info?.expired ? "Ce lien de partage a expiré." : "Ce fichier n'existe plus ou le lien est invalide."}
            </p>
          </div>
        ) : (
          <div className="space-y-5 rounded-2xl border border-border/60 bg-card/40 p-6">
            <div className="flex flex-col items-center gap-3">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileIcon className="size-7" />
              </div>
              <div className="min-w-0">
                <p className="break-words font-medium" data-testid="share-filename">
                  {info.encrypted ? (meta?.name ?? "Fichier chiffré") : info.filename}
                </p>
                <p className="text-sm text-muted-foreground">
                  {info.encrypted ? (meta ? formatBytes(meta.size) : "chiffré de bout en bout") : formatBytes(info.size ?? 0)}
                </p>
              </div>
            </div>

            {info.encrypted && !fk && !info.e2eePassword && (
              <p className="text-sm text-destructive">Ce lien est incomplet : la clé de déchiffrement (la partie après « # ») manque.</p>
            )}

            {info.encrypted && info.e2eePassword && !fk && (
              <form
                className="space-y-1.5 text-left"
                onSubmit={(e) => { e.preventDefault(); void unlockWithPassword(); }}
              >
                <label className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="size-3.5" /> Mot de passe
                </label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Requis pour déchiffrer" data-testid="share-password" />
                <Button type="submit" className="w-full" disabled={busy || !password}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Déverrouiller
                </Button>
              </form>
            )}

            {info.hasPassword && !info.encrypted && (
              <div className="space-y-1.5 text-left">
                <label className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="size-3.5" /> Mot de passe
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Requis pour télécharger"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button className="w-full gap-2" onClick={download} disabled={busy || (Boolean(info.encrypted) && !fk)} data-testid="share-download">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {busy
                ? progress !== null ? `Téléchargement… ${progress}%` : "Préparation…"
                : "Télécharger"}
            </Button>
          </div>
        )}

        {info?.exists && !info.expired && (
          <div className="space-y-2 text-xs text-muted-foreground">
            {reportSent ? (
              <p>Merci, ton signalement a été transmis.</p>
            ) : reporting ? (
              <div className="space-y-2 text-left">
                <Input
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Pourquoi signales-tu ce fichier ?"
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={sendReport} disabled={busy || reportReason.trim().length < 3}>
                    Envoyer le signalement
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" className="inline-flex items-center gap-1 underline-offset-2 hover:underline" onClick={() => setReporting(true)}>
                <Flag className="size-3" /> Signaler ce fichier
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground/50">
          Partagé via Drivecord · stockage de fichiers
        </p>
      </motion.div>
    </div>
  );
}

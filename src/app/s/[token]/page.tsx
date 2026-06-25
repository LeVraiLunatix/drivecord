"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Download, FileIcon, Lock, Loader2, CloudUpload, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/utils/format";

type Info = {
  exists: boolean;
  expired: boolean;
  hasPassword: boolean;
  filename: string | null;
  size: number | null;
  mimeType: string | null;
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

  React.useEffect(() => {
    fetch(`/api/s/${token}`)
      .then((r) => r.json())
      .then((d) => setInfo(d))
      .catch(() => setInfo({ exists: false, expired: false, hasPassword: false, filename: null, size: null, mimeType: null }))
      .finally(() => setLoading(false));
  }, [token]);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

      // Encrypted files are decrypted server-side and returned as raw bytes.
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        triggerDownload(await res.blob(), info?.filename ?? "fichier");
        return;
      }

      // Plaintext files come back as a manifest the browser fetches + assembles.
      const manifest = (await res.json()) as Manifest;
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
                <p className="break-words font-medium">{info.filename}</p>
                <p className="text-sm text-muted-foreground">{formatBytes(info.size ?? 0)}</p>
              </div>
            </div>

            {info.hasPassword && (
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

            <Button className="w-full gap-2" onClick={download} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {busy
                ? progress !== null ? `Téléchargement… ${progress}%` : "Préparation…"
                : "Télécharger"}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground/50">
          Partagé via Drivecord · stockage de fichiers
        </p>
      </motion.div>
    </div>
  );
}

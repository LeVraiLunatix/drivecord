"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { toast } from "sonner";
import { Images, HardDrive, Loader2, Check, Play, Square, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";
import { cn } from "@/lib/utils";
import { useAllDrives } from "@/lib/storage";
import { recordUploadedFile, createFolder } from "@/lib/storage";
import { DiscordClient } from "@/lib/discord/client";
import {
  cameraRollAvailable,
  listCameraRoll,
  streamCameraItem,
  readCameraItem,
  getBackedUp,
  markBackedUp,
} from "@/lib/camera-roll";

const FOLDER_KEY = (driveId: string) => `drivecord:camroll-folder:${driveId}`;

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

export default function BackupPage() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;
  const drives = useAllDrives();
  const native = cameraRollAvailable();

  const [target, setTarget] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [backedCount, setBackedCount] = React.useState(0);
  const cancelRef = React.useRef(false);

  React.useEffect(() => {
    if (!target && drives && drives.length) setTarget(drives[0].id);
  }, [drives, target]);

  React.useEffect(() => {
    if (target) setBackedCount(getBackedUp(target).size);
  }, [target, running]);

  const ensureRoot = async (driveId: string): Promise<string> => {
    const cached = localStorage.getItem(FOLDER_KEY(driveId));
    if (cached) return cached;
    const id = await createFolder({ driveId, parentId: null, name: "Pellicule" });
    localStorage.setItem(FOLDER_KEY(driveId), id);
    return id;
  };

  /** Folder for a given album (under Pellicule), creating it once and caching. */
  const ensureAlbumFolder = async (driveId: string, rootId: string, album: string | null): Promise<string> => {
    if (!album) return rootId;
    const key = `${FOLDER_KEY(driveId)}:${album}`;
    const cached = localStorage.getItem(key);
    if (cached) return cached;
    const id = await createFolder({ driveId, parentId: rootId, name: album });
    localStorage.setItem(key, id);
    return id;
  };

  const run = async () => {
    const drive = drives?.find((d) => d.id === target);
    if (!drive) { toast.error("Choisis un drive"); return; }
    setRunning(true);
    cancelRef.current = false;
    try {
      const all = await listCameraRoll();
      const done = getBackedUp(drive.id);
      const todo = all.filter((m) => !done.has(m.identifier));
      if (todo.length === 0) { toast.success("Pellicule déjà à jour ✅"); return; }

      const client = DiscordClient.fromUrl(drive.webhookUrl);
      const rootId = await ensureRoot(drive.id);
      const folderCache = new Map<string, string>(); // album → folderId
      setProgress({ done: 0, total: todo.length });

      // DB stores size as a 32-bit Int → hard cap ~2 GB per file.
      const MAX_BYTES = 2_000_000_000;
      let ok = 0;
      let skipped = 0;
      let firstError = "";
      for (let i = 0; i < todo.length; i++) {
        if (cancelRef.current) break;
        try {
          const it = todo[i];
          const albumKey = it.album ?? "";
          let parentId = folderCache.get(albumKey);
          if (parentId === undefined) {
            parentId = await ensureAlbumFolder(drive.id, rootId, it.album);
            folderCache.set(albumKey, parentId);
          }

          let manifest = null;
          // 1) Try memory-safe streaming (best for large videos).
          try {
            const s = await streamCameraItem(it.identifier);
            if (s.size && s.size > MAX_BYTES) { skipped += 1; setProgress({ done: i + 1, total: todo.length }); continue; }
            if (s.stream) {
              manifest = await client.uploadStream(s.stream, { filename: s.filename, mimeType: s.mimeType, totalSize: s.size });
            }
          } catch (streamErr) {
            if (!firstError) firstError = `stream: ${(streamErr as Error).message}`;
          }
          // 2) Fallback: base64 read → upload (proven path, OOM risk on huge files).
          if (!manifest) {
            const { blob, filename, mimeType } = await readCameraItem(it.identifier);
            if (blob.size > MAX_BYTES) { skipped += 1; setProgress({ done: i + 1, total: todo.length }); continue; }
            const file = new File([blob], filename, { type: mimeType });
            manifest = await client.uploadFile(file);
          }
          await recordUploadedFile({ driveId: drive.id, parentId, manifest });
          markBackedUp(drive.id, [it.identifier]);
          ok += 1;
        } catch (err) {
          if (!firstError) firstError = (err as Error).message;
        }
        setProgress({ done: i + 1, total: todo.length });
        await new Promise((r) => setTimeout(r, 30));
      }
      setBackedCount(getBackedUp(drive.id).size);
      if (ok === 0 && firstError) {
        toast.error(`Aucun média sauvegardé. Erreur : ${firstError.slice(0, 120)}`);
      } else {
        const extra = skipped > 0 ? ` · ${skipped} ignoré(s) (> 2 Go)` : "";
        toast.success(`${ok} média(s) sauvegardé(s) dans « ${drive.name} » › Pellicule${extra}`);
      }
    } catch (e) {
      toast.error(`Échec : ${(e as Error).message}`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <motion.div
      variants={v ?? container}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 px-5 pb-20 sm:px-6"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <motion.div variants={v ?? item}><BackButton fallback="/drive" className="w-fit" /></motion.div>

      <motion.header variants={v ?? item} className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Images className="size-7 text-primary" /> Sauvegarde pellicule
        </h1>
        <p className="text-sm text-muted-foreground">
          Sauvegarde tes photos et vidéos dans un drive. Tes albums deviennent des sous-dossiers de « Pellicule ». Seuls les nouveaux médias sont envoyés.
        </p>
      </motion.header>

      {!native ? (
        <motion.div variants={v ?? item}>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center text-muted-foreground">
              <Smartphone className="size-8" />
              <p className="text-sm">Cette fonction est disponible uniquement dans l&apos;application iPhone (accès à la pellicule).</p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          <motion.div variants={v ?? item}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HardDrive className="size-4 text-muted-foreground" /> Drive de destination
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(drives ?? []).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setTarget(d.id)}
                    disabled={running}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      target === d.id ? "border-primary bg-primary/10" : "border-border/50 hover:bg-accent/60",
                    )}
                  >
                    <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    {target === d.id && <Check className="size-4 text-primary" />}
                  </button>
                ))}
                {(drives ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun drive. Ajoute-en un d&apos;abord.</p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={v ?? item}>
            <Card>
              <CardContent className="space-y-4 p-5">
                <p className="text-sm text-muted-foreground">
                  {backedCount} média(s) déjà sauvegardé(s) sur ce drive.
                </p>
                {progress && (
                  <div className="space-y-1.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all"
                        style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{progress.done} / {progress.total}</p>
                  </div>
                )}
                {running ? (
                  <Button variant="outline" className="w-full gap-2" onClick={() => { cancelRef.current = true; }}>
                    <Square className="size-4" /> Arrêter
                  </Button>
                ) : (
                  <Button className="w-full gap-2" onClick={run} disabled={!target}>
                    <Play className="size-4" /> Sauvegarder maintenant
                  </Button>
                )}
                {running && !progress && (
                  <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Lecture de la pellicule…
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.p variants={v ?? item} className="text-xs text-muted-foreground/60">
            💡 Garde l&apos;app ouverte pendant la sauvegarde. Relance quand tu veux : seuls les nouveaux médias seront envoyés.
          </motion.p>
        </>
      )}
    </motion.div>
  );
}

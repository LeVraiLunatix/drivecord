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
import { recordUploadedFile, createFolder, refreshDrive } from "@/lib/storage";
import { DiscordClient } from "@/lib/discord/client";
import {
  cameraRollAvailable,
  listCameraRoll,
  streamCameraItemRanged,
  readCameraItem,
  getBackedUp,
  markBackedUp,
  reconcileTracker,
  clearTracker,
} from "@/lib/camera-roll";
import { DEFAULT_CHUNK_SIZE } from "@/lib/discord/constants";

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
    if (!target) return;
    setBackedCount(getBackedUp(target).size);
    // Reconcile against the drive so the count reflects reality (deleted files).
    (async () => {
      try {
        const r = await fetch(`/api/drive/${target}/file-ids`);
        if (r.ok) {
          const { ids } = await r.json();
          setBackedCount(reconcileTracker(target, new Set<string>(ids)).size);
        }
      } catch { /* offline */ }
    })();
  }, [target, running]);

  const resetTracking = () => {
    if (!target) return;
    clearTracker(target);
    setBackedCount(0);
    toast.success("Suivi réinitialisé — la prochaine sauvegarde renverra tout.");
  };

  // `existing` = ids of folders that ACTUALLY still exist in the drive. A cached
  // id is only reused if it's still there — otherwise the folder was deleted and
  // reusing its id would orphan every uploaded file (saved on the server but
  // invisible because their parent folder is gone). In that case we recreate it.
  const ensureRoot = async (driveId: string, existing: Set<string>): Promise<string> => {
    const cached = localStorage.getItem(FOLDER_KEY(driveId));
    if (cached && existing.has(cached)) return cached;
    const id = await createFolder({ driveId, parentId: null, name: "Pellicule" });
    localStorage.setItem(FOLDER_KEY(driveId), id);
    existing.add(id);
    return id;
  };

  /** Folder for a given album (under Pellicule), creating it once and caching. */
  const ensureAlbumFolder = async (driveId: string, rootId: string, album: string | null, existing: Set<string>): Promise<string> => {
    if (!album) return rootId;
    const key = `${FOLDER_KEY(driveId)}:${album}`;
    const cached = localStorage.getItem(key);
    if (cached && existing.has(cached)) return cached;
    const id = await createFolder({ driveId, parentId: rootId, name: album });
    localStorage.setItem(key, id);
    existing.add(id);
    return id;
  };

  const run = async () => {
    const drive = drives?.find((d) => d.id === target);
    if (!drive) { toast.error("Choisis un drive"); return; }
    setRunning(true);
    cancelRef.current = false;
    try {
      const all = await listCameraRoll();

      // Which folders still exist on the server (so we don't upload into a
      // deleted folder and orphan the files).
      const existingFolders = new Set<string>();
      try {
        const fr = await fetch(`/api/drive/${drive.id}/folders`);
        if (fr.ok) { const { folders } = await fr.json(); for (const f of folders ?? []) existingFolders.add(f.id); }
      } catch { /* offline → cached ids used as-is */ }

      // If the cached "Pellicule" root no longer exists on the server, every
      // previously-uploaded media is orphaned (invisible). Reset the tracker so
      // the whole library re-uploads into a fresh, visible folder.
      const cachedRoot = localStorage.getItem(FOLDER_KEY(drive.id));
      const rootStale = Boolean(cachedRoot) && !existingFolders.has(cachedRoot as string);
      if (rootStale) clearTracker(drive.id);

      // Reconcile the tracker with what's actually still in the drive — anything
      // deleted there will be re-uploaded.
      let done = rootStale ? new Set<string>() : getBackedUp(drive.id);
      if (!rootStale) {
        try {
          const r = await fetch(`/api/drive/${drive.id}/file-ids`);
          if (r.ok) { const { ids } = await r.json(); done = reconcileTracker(drive.id, new Set<string>(ids)); }
        } catch { /* offline → use local tracker as-is */ }
      }
      setBackedCount(done.size);
      const todo = all.filter((m) => !done.has(m.identifier));
      if (todo.length === 0) { toast.success("Pellicule déjà à jour ✅"); return; }

      const client = DiscordClient.fromUrl(drive.webhookUrl);
      const rootId = await ensureRoot(drive.id, existingFolders);
      const folderCache = new Map<string, string>(); // album → folderId
      setProgress({ done: 0, total: todo.length });

      // DB stores size as a 32-bit Int → hard cap ~2 GB per file.
      const MAX_BYTES = 2_000_000_000;
      // The base64 fallback loads the whole file into memory → only use it for
      // small media to avoid OOM (the ranged stream handles everything bigger).
      const BASE64_MAX = 60_000_000; // 60 MB
      const CHUNK = DEFAULT_CHUNK_SIZE;
      // Skip any media that hangs (e.g. iCloud photo not downloaded locally).
      const ITEM_TIMEOUT = 120_000;
      let ok = 0;
      let skipped = 0;
      let stuck = 0;
      let firstError = "";

      // Upload one media. Returns "ok" | "skipped"; throws on error/abort.
      const processItem = async (
        it: { identifier: string; album: string | null },
        signal: AbortSignal,
      ): Promise<"ok" | "skipped"> => {
        const albumKey = it.album ?? "";
        let parentId = folderCache.get(albumKey);
        if (parentId === undefined) {
          parentId = await ensureAlbumFolder(drive.id, rootId, it.album, existingFolders);
          folderCache.set(albumKey, parentId);
        }
        let manifest = null;
        let tooBig = false;
        // 1) Range-read streaming — never holds more than one chunk in memory
        //    (this is what stops the WebView OOM-crash on big videos).
        try {
          const s = await streamCameraItemRanged(it.identifier, CHUNK, signal);
          if (s.size && s.size > MAX_BYTES) { await s.stream.cancel().catch(() => {}); return "skipped"; }
          if (s.ranged) {
            manifest = await client.uploadStream(s.stream, {
              filename: s.filename, mimeType: s.mimeType, totalSize: s.size, chunkSize: CHUNK, signal,
            });
          } else {
            // Range NOT honored → consuming the stream would load the whole file
            // and crash the WebView on big media. Only the small base64 path is
            // safe; bigger files are skipped rather than risking a crash.
            await s.stream.cancel().catch(() => {});
            if (!s.size || s.size > BASE64_MAX) tooBig = true;
          }
        } catch (streamErr) {
          if ((streamErr as Error).name === "AbortError") throw streamErr;
          if (!firstError) firstError = `stream: ${(streamErr as Error).message}`;
        }
        if (tooBig) return "skipped";
        // 2) Fallback: base64 read → upload (small files only, to stay safe).
        if (!manifest) {
          const { blob, filename, mimeType } = await readCameraItem(it.identifier, signal);
          if (blob.size > BASE64_MAX) return "skipped";
          const file = new File([blob], filename, { type: mimeType });
          manifest = await client.uploadFile(file, { signal });
        }
        const fileId = await recordUploadedFile({ driveId: drive.id, parentId, manifest, silent: true });
        markBackedUp(drive.id, it.identifier, fileId);
        return "ok";
      };

      for (let i = 0; i < todo.length; i++) {
        if (cancelRef.current) break;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ITEM_TIMEOUT);
        try {
          const res = await Promise.race<"ok" | "skipped">([
            processItem(todo[i], controller.signal),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("__timeout__")), ITEM_TIMEOUT + 2000)),
          ]);
          if (res === "ok") ok += 1; else skipped += 1;
        } catch (err) {
          const e = err as Error;
          if (e.message === "__timeout__" || e.name === "AbortError") stuck += 1;
          else if (!firstError) firstError = e.message;
        } finally {
          clearTimeout(timer);
        }
        setProgress({ done: i + 1, total: todo.length });
        // Refresh the drive periodically so files show up live and survive an
        // unexpected reload mid-backup.
        if ((i + 1) % 15 === 0) refreshDrive(drive.id);
        await new Promise((r) => setTimeout(r, 30));
      }
      refreshDrive(drive.id); // final SWR refresh
      setBackedCount(getBackedUp(drive.id).size);
      if (ok === 0 && firstError) {
        toast.error(`Aucun média sauvegardé. Erreur : ${firstError.slice(0, 120)}`);
      } else {
        const parts: string[] = [];
        if (skipped) parts.push(`${skipped} trop volumineux`);
        if (stuck) parts.push(`${stuck} bloqué(s)`);
        const extra = parts.length ? ` · ${parts.join(" · ")} ignoré(s)` : "";
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
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 tabbar-pad px-5 pb-20 sm:px-6"
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
                  <div className="space-y-2">
                    <Button className="w-full gap-2" onClick={run} disabled={!target}>
                      <Play className="size-4" /> Sauvegarder maintenant
                    </Button>
                    {backedCount > 0 && (
                      <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={resetTracking}>
                        Réinitialiser le suivi
                      </Button>
                    )}
                  </div>
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

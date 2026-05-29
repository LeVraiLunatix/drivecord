"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  DiscordClient,
  type FileManifest,
  type UploadProgress,
  type WebhookInfo,
} from "@/lib/discord";
import {
  addDriveFromWebhook,
  recordUploadedFile,
  hardDeleteFile,
  useActiveDrive,
  useDriveItems,
  useDriveUsage,
  type FileEntry,
} from "@/lib/storage";

type Stage = "idle" | "validating" | "valid" | "uploading" | "ready";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

export default function DevDiscordPage() {
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [stage, setStage] = React.useState<Stage>("idle");
  const [client, setClient] = React.useState<DiscordClient | null>(null);
  const [info, setInfo] = React.useState<WebhookInfo | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState<UploadProgress | null>(
    null,
  );
  const [manifest, setManifest] = React.useState<FileManifest | null>(null);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [downloadedSize, setDownloadedSize] = React.useState<number | null>(null);
  const [downloadElapsed, setDownloadElapsed] = React.useState<number | null>(null);

  const activeDrive = useActiveDrive();
  const usage = useDriveUsage(activeDrive?.id ?? null);
  const items = useDriveItems(activeDrive?.id ?? null, null);
  const persistedFiles = React.useMemo(
    () =>
      (items ?? []).flatMap((i) =>
        i.kind === "file" ? [i as FileEntry & { kind: "file" }] : [],
      ),
    [items],
  );

  // Hydrate webhook URL field + reconstruct the DiscordClient from an
  // existing drive so the user doesn't have to re-click "Valider" after
  // every page reload. The drive in IDB has already been validated; we
  // trust it and skip the network round-trip.
  React.useEffect(() => {
    if (!activeDrive) return;
    if (!webhookUrl) setWebhookUrl(activeDrive.webhookUrl);
    if (!client) {
      try {
        const c = DiscordClient.fromUrl(activeDrive.webhookUrl);
        setClient(c);
        if (stage === "idle") setStage("valid");
      } catch {
        /* malformed URL in storage — user will need to revalidate */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDrive?.id]);

  const validate = async () => {
    setStage("validating");
    try {
      // Persist the drive AND remember it as active.
      const drive = await addDriveFromWebhook(webhookUrl);
      const c = DiscordClient.fromUrl(drive.webhookUrl);
      const i = await c.info();
      setClient(c);
      setInfo(i);
      setStage("valid");
      toast.success(`Drive « ${drive.name} » prêt`);
    } catch (err) {
      setStage("idle");
      setClient(null);
      setInfo(null);
      toast.error(`Échec validation : ${(err as Error).message}`);
    }
  };

  const upload = async () => {
    // Make silent-fail conditions visible — we used to just `return`.
    if (!file) {
      toast.error("Aucun fichier sélectionné");
      return;
    }
    if (!client) {
      toast.error("Valide d'abord ton webhook");
      return;
    }
    if (!activeDrive) {
      toast.error("Aucun drive actif (recharge la page après validation)");
      return;
    }
    setManifest(null);
    setDownloadedSize(null);
    setUploadProgress({
      loaded: 0,
      total: file.size,
      chunksDone: 0,
      chunksTotal: 0,
    });
    setStage("uploading");
    const t0 = performance.now();
    try {
      const m = await client.uploadFile(file, {
        onProgress: setUploadProgress,
      });
      const elapsed = (performance.now() - t0) / 1000;
      setManifest(m);

      // Persist the manifest into IndexedDB so it survives reloads.
      await recordUploadedFile({
        driveId: activeDrive.id,
        parentId: null,
        manifest: m,
      });

      setStage("ready");
      toast.success(
        `Upload OK : ${m.chunks.length} chunk(s) en ${elapsed.toFixed(1)}s — persisté`,
      );
    } catch (err) {
      setStage("valid");
      toast.error(`Upload KO : ${(err as Error).message}`);
    }
  };

  const downloadManifest = async (
    m: FileManifest,
    label: string,
    id?: string,
  ) => {
    if (!client) return;
    setDownloading(id ?? "current");
    setDownloadedSize(null);
    setDownloadElapsed(null);
    const t0 = performance.now();
    try {
      const blob = await client.downloadFile(m);
      const elapsed = (performance.now() - t0) / 1000;
      setDownloadedSize(blob.size);
      setDownloadElapsed(elapsed);
      if (blob.size !== m.size) {
        toast.error(`Taille incorrecte : attendu ${m.size}, reçu ${blob.size}`);
      } else {
        toast.success(`${label} : ${formatBytes(blob.size)} en ${elapsed.toFixed(1)}s`);
      }
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = m.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 60_000);
    } catch (err) {
      toast.error(`Download KO : ${(err as Error).message}`);
    } finally {
      setDownloading(null);
    }
  };

  const removePersisted = async (f: FileEntry) => {
    if (!client) return;
    setDeletingId(f.id);
    try {
      // Reconstruct a FileManifest from the persisted FileEntry.
      await client.deleteFile({
        size: f.size,
        mimeType: f.mimeType,
        filename: f.filename,
        chunkSize: f.chunkSize,
        chunks: f.chunks,
      });
      await hardDeleteFile(f.driveId, f.id);
      toast.success(`Fichier supprimé (Discord + IDB)`);
    } catch (err) {
      toast.error(`Delete KO : ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const pct = uploadProgress
    ? (uploadProgress.loaded / Math.max(1, uploadProgress.total)) * 100
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/">
          <ArrowLeft className="size-4" />
          Retour
        </Link>
      </Button>

      <div className="space-y-2">
        <Badge variant="secondary" className="font-mono">
          dev only — phases 2 + 3
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          Test du client Discord
        </h1>
        <p className="text-muted-foreground">
          Banc d&apos;essai pour valider l&apos;upload/download chunked et la
          persistance IndexedDB.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="webhook">URL du webhook Discord</Label>
          <Input
            id="webhook"
            type="text"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            spellCheck={false}
            autoComplete="off"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={validate}
              disabled={!webhookUrl || stage === "validating"}
            >
              {stage === "validating" && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Valider & enregistrer
            </Button>
            {info && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-green-500" />
                <span className="font-mono">{info.name ?? "(sans nom)"}</span>
                <span>·</span>
                <span className="font-mono">channel {info.channel_id}</span>
              </div>
            )}
          </div>
          {activeDrive && (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs">
              <Database className="size-3.5" />
              <span className="font-mono">{activeDrive.name}</span>
              <span className="text-muted-foreground">
                · drive {activeDrive.id.slice(0, 8)}…
              </span>
              {usage && (
                <span className="ml-auto text-muted-foreground">
                  {usage.fileCount} fichier(s) · {formatBytes(usage.totalBytes)}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {client && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={stage === "uploading"}
            />
            {file && (
              <div className="text-sm text-muted-foreground">
                <span className="font-mono">{file.name}</span> ·{" "}
                {formatBytes(file.size)}
                {file.type && (
                  <>
                    {" "}
                    · <span className="font-mono">{file.type}</span>
                  </>
                )}
              </div>
            )}
            <Button
              onClick={upload}
              disabled={!file || stage === "uploading"}
            >
              {stage === "uploading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload + enregistrer
            </Button>
            {uploadProgress && (
              <div className="space-y-2">
                <Progress value={pct} />
                <p className="text-xs text-muted-foreground">
                  {formatBytes(uploadProgress.loaded)} /{" "}
                  {formatBytes(uploadProgress.total)} · chunks{" "}
                  {uploadProgress.chunksDone}/{uploadProgress.chunksTotal} ·{" "}
                  {pct.toFixed(1)}%
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {manifest && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Dernier manifest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Filename</dt>
              <dd className="font-mono">{manifest.filename}</dd>
              <dt className="text-muted-foreground">Size</dt>
              <dd className="font-mono">{formatBytes(manifest.size)}</dd>
              <dt className="text-muted-foreground">MIME</dt>
              <dd className="font-mono">{manifest.mimeType || "—"}</dd>
              <dt className="text-muted-foreground">Chunks</dt>
              <dd className="font-mono">{manifest.chunks.length}</dd>
            </dl>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => downloadManifest(manifest, "Download OK")}
                disabled={downloading !== null}
              >
                {downloading === "current" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download & vérifier
              </Button>
            </div>
            {downloadedSize !== null && (
              <div className="flex items-center gap-2 text-sm">
                {downloadedSize === manifest.size ? (
                  <>
                    <CheckCircle2 className="size-4 text-green-500" />
                    <span>
                      Round-trip OK : {formatBytes(downloadedSize)} en{" "}
                      {downloadElapsed?.toFixed(1)}s
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-4 text-red-500" />
                    <span>
                      Taille mismatch : reçu {formatBytes(downloadedSize)}
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {client && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              4. Fichiers persistés dans ce drive
            </CardTitle>
          </CardHeader>
          <CardContent>
            {persistedFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun fichier persisté pour l&apos;instant. Upload-en un pour
                qu&apos;il apparaisse ici — il survivra au rechargement de la
                page.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {persistedFiles.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono">{f.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(f.size)} · {f.chunks.length} chunk(s) ·
                        ajouté {new Date(f.createdAt).toLocaleString("fr-FR")}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloading !== null}
                      onClick={() =>
                        downloadManifest(
                          {
                            size: f.size,
                            mimeType: f.mimeType,
                            filename: f.filename,
                            chunkSize: f.chunkSize,
                            chunks: f.chunks,
                          },
                          "Re-download OK",
                          f.id,
                        )
                      }
                    >
                      {downloading === f.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deletingId !== null}
                      onClick={() => removePersisted(f)}
                    >
                      {deletingId === f.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

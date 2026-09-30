"use client";

import * as React from "react";
import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnlockScreen } from "@/components/e2ee/unlock-screen";
import { useEmbed } from "@/components/embed/use-embed";
import { authFetch } from "@/lib/api-base";
import { decryptFile } from "@/lib/e2ee-client/decrypt-items";
import { decryptDownloaded } from "@/lib/e2ee-client/file-crypto";
import type { FileEntry } from "@/lib/storage/schema";

type Shown = { url: string; name: string; mime: string; text?: string };
const TEXT_LIMIT = 256 * 1024;
const SAFE_INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)|video\/(mp4|webm|ogg)|audio\/(mpeg|mp3|ogg|wav|webm|flac|aac))$/;

function Viewer({ fileId }: { fileId: string }) {
  const clientId = useSearchParams().get("client_id") ?? "";
  const e = useEmbed(clientId);
  const [shown, setShown] = React.useState<Shown | null>(null);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (e.phase !== "ready" || !e.drive) return;
    const { drive } = e;
    let url = "";
    let cancelled = false;
    (async () => {
      const res = await authFetch(`/api/drive/${drive.id}/files/${encodeURIComponent(fileId)}`);
      if (!res.ok) throw new Error("Fichier introuvable.");
      const raw = (await res.json()) as FileEntry;
      // The viewer only opens files of the app's own folder (same confinement as the API).
      const tree = (await (await authFetch(`/api/drive/${drive.id}/tree?all=1`)).json()) as { folders: { id: string; parentId: string }[] };
      const byId = new Map(tree.folders.map((f) => [f.id, f.parentId]));
      let cur = raw.parentId, inside = false;
      for (let i = 0; i < 64 && cur; i++) { if (cur === drive.appFolderId) { inside = true; break; } cur = byId.get(cur) ?? ""; }
      if (!inside) throw new Error("Ce fichier n'appartient pas à cette application.");
      const f = await decryptFile(drive.dk, raw);
      const enc = await drive.client.downloadFile({ size: f.size, mimeType: f.mimeType, filename: f.filename, chunkSize: f.chunkSize, chunks: f.chunks });
      const blob = await decryptDownloaded(drive.id, enc, f);
      if (cancelled) return;
      const mime = (f.mimeType || blob.type || "application/octet-stream").toLowerCase();
      const text = mime.startsWith("text/") && blob.size <= TEXT_LIMIT ? await blob.text() : undefined;
      // Re-type the blob: only known-safe media types are ever rendered; everything else is download-only.
      url = URL.createObjectURL(new Blob([blob], { type: SAFE_INLINE.test(mime) ? mime : "application/octet-stream" }));
      setShown({ url, name: f.filename, mime, text });
    })().catch((x) => !cancelled && setErr((x as Error).message));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [e.phase, e.drive, fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (e.phase === "loading") return <Center><Loader2 className="size-5 animate-spin text-muted-foreground" /></Center>;
  if (e.phase === "needs-auth" || e.phase === "authing") {
    return <Center><p className="text-sm text-muted-foreground">Connecte-toi à Drivecord pour afficher ce fichier chiffré.</p><Button onClick={e.connect} disabled={e.phase === "authing"}>Se connecter</Button>{e.error && <p className="text-xs text-red-400">{e.error}</p>}</Center>;
  }
  if (e.phase === "locked") return <UnlockScreen />;
  if (e.phase === "needs-setup") return <Center><p className="text-sm">Configure d&apos;abord ton chiffrement sur drivecord.app.</p></Center>;
  if (err || e.phase === "error") return <Center><p className="text-sm text-red-400">{err || e.error || "Erreur."}</p></Center>;
  if (!shown) return <Center><Loader2 className="size-5 animate-spin text-muted-foreground" /><p className="text-xs text-muted-foreground">Déchiffrement…</p></Center>;

  const inline = SAFE_INLINE.test(shown.mime);
  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
        {inline && shown.mime.startsWith("image/") && (
          // eslint-disable-next-line @next/next/no-img-element -- decrypted blob: URL, nothing for next/image to optimise
          <img src={shown.url} alt={shown.name} className="max-h-full max-w-full object-contain" />
        )}
        {inline && shown.mime.startsWith("video/") && <video src={shown.url} controls className="max-h-full max-w-full" />}
        {inline && shown.mime.startsWith("audio/") && <audio src={shown.url} controls />}
        {shown.text !== undefined && <pre className="h-full w-full overflow-auto whitespace-pre-wrap p-2 text-xs">{shown.text}</pre>}
        {!inline && shown.text === undefined && <p className="text-sm text-muted-foreground">Aperçu indisponible pour ce type de fichier.</p>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-1 text-muted-foreground"><Lock className="size-3 shrink-0" /><span className="truncate">{shown.name}</span></span>
        <Button asChild size="sm" variant="outline"><a href={shown.url} download={shown.name}><Download className="size-3.5" />Télécharger</a></Button>
      </div>
    </div>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-4 text-center">{children}</div>;

export default function Page({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = use(params);
  return <Suspense><Viewer fileId={fileId} /></Suspense>;
}

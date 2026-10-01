"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Lock, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnlockScreen } from "@/components/e2ee/unlock-screen";
import { useEmbed } from "@/components/embed/use-embed";
import { prepareEncryptedUpload } from "@/lib/e2ee-client/file-crypto";
import { recordUploadedFile } from "@/lib/storage/files";

function Uploader() {
  const clientId = useSearchParams().get("client_id") ?? "";
  const e = useEmbed(clientId);
  const { post } = e;
  const [state, setState] = React.useState<{ name: string; percent: number; done: boolean } | null>(null);
  const [err, setErr] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  const root = React.useRef<HTMLDivElement>(null);

  // Tell the host how tall we are so it can size the iframe.
  React.useEffect(() => {
    const ro = new ResizeObserver(() => root.current && post({ type: "resize", height: root.current.offsetHeight }));
    if (root.current) ro.observe(root.current);
    return () => ro.disconnect();
  }, [post]);

  const upload = async (files: File[]) => {
    if (!e.drive) return;
    setErr("");
    for (const file of files) {
      try {
        setState({ name: file.name, percent: 0, done: false });
        const prep = await prepareEncryptedUpload(e.drive.dk, file);
        const manifest = await e.drive.client.uploadStream(prep.stream, {
          filename: prep.discordName, mimeType: "application/octet-stream", totalSize: prep.cipherSize, chunkSize: prep.chunkSize,
          onProgress: (p) => { const percent = Math.round((p.loaded / Math.max(1, prep.cipherSize)) * 100); setState({ name: file.name, percent, done: false }); post({ type: "progress", fileId: prep.fileId, percent }); },
        });
        const fin = await prep.finalize(manifest.size);
        await recordUploadedFile({ driveId: e.drive.id, parentId: e.drive.appFolderId, manifest, e2ee: { fileId: prep.fileId, ...fin }, silent: true });
        setState({ name: file.name, percent: 100, done: true });
        // Nothing but the id and the (ciphertext) size leaves the iframe.
        post({ type: "uploaded", fileId: prep.fileId, size: manifest.size });
      } catch (x) {
        setErr((x as Error).message);
        setState(null);
        post({ type: "error", code: "upload_failed" });
      }
    }
  };

  let body: React.ReactNode;
  switch (e.phase) {
    case "loading": body = <Loader2 className="size-5 animate-spin text-muted-foreground" />; break;
    case "needs-auth":
    case "authing":
      body = (
        <>
          <p className="text-sm text-muted-foreground">Connecte-toi à Drivecord pour envoyer un fichier chiffré.</p>
          <Button onClick={e.connect} disabled={e.phase === "authing"}>{e.phase === "authing" && <Loader2 className="size-4 animate-spin" />}Se connecter</Button>
          {e.error && <p className="text-xs text-red-400">{e.error}</p>}
        </>
      );
      break;
    case "needs-setup": body = <p className="text-sm">Configure d&apos;abord ton chiffrement sur <a className="underline" href="/drive" target="_blank" rel="noopener">drivecord.app</a>.</p>; break;
    case "locked": body = <UnlockScreen />; break;
    case "error": body = <p className="text-sm text-red-400">{e.error || "Erreur."}</p>; break;
    case "ready":
      body = (
        <>
          <input ref={input} type="file" hidden multiple={e.options.multiple} accept={e.options.accept} onChange={(ev) => { const f = Array.from(ev.target.files ?? []); ev.target.value = ""; if (f.length) void upload(f); }} />
          <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-sm hover:bg-card/60" onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { ev.preventDefault(); const f = Array.from(ev.dataTransfer.files); if (f.length) void upload(e.options.multiple ? f : f.slice(0, 1)); }}>
            <UploadCloud className="size-6 text-muted-foreground" />
            <span>Choisir un fichier ou le déposer ici</span>
          </button>
          {state && (
            <div className="w-full space-y-1 text-left text-xs">
              <div className="flex items-center justify-between gap-2"><span className="truncate">{state.name}</span>{state.done ? <CheckCircle2 className="size-4 text-emerald-400" /> : <span>{state.percent}%</span>}</div>
              <div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-violet-500 transition-all" style={{ width: `${state.percent}%` }} /></div>
            </div>
          )}
          {err && <p className="text-xs text-red-400">{err}</p>}
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="size-3" />Chiffré sur ton appareil avant l&apos;envoi — {e.appName} ne voit jamais la clé.</p>
        </>
      );
  }
  return <div ref={root} className="flex flex-col items-center gap-3 p-4 text-center">{body}</div>;
}

export default function Page() {
  return <Suspense><Uploader /></Suspense>;
}

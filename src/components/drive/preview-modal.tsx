"use client";

import * as React from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileX,
  Music,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format";
import { kindOf } from "@/lib/utils/file-icons";
import { useFile } from "@/lib/storage";
import { useDiscordClient } from "@/lib/discord/context";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  driveId: string | null;
  fileId: string | null;
  siblings?: string[];
  onClose: () => void;
  onNavigate?: (id: string) => void;
};

type LoadState = "idle" | "loading" | "done" | "error";

const TEXT_KINDS = new Set(["code", "text"]);
const PREVIEWABLE_KINDS = new Set(["image", "video", "audio", "pdf", "code", "text"]);

/** HEIC/HEIF extensions that need client-side conversion. */
const HEIC_EXTS = new Set(["heic", "heif"]);

function isTextKind(kind: string) {
  return TEXT_KINDS.has(kind);
}

function getExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

// ── HEIC conversion ────────────────────────────────────────────────────────────

/** Convert a HEIC/HEIF blob to a JPEG blob using heic2any (lazy-loaded). */
async function convertHeic(blob: Blob): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(result) ? result[0] : result;
}

// ── Video sub-component ────────────────────────────────────────────────────────

function VideoPreview({
  blobUrl,
  mimeType,
  onDownload,
}: {
  blobUrl: string;
  mimeType: string;
  onDownload: () => void;
}) {
  const [cannotPlay, setCannotPlay] = React.useState(false);

  if (cannotPlay) {
    return (
      <div className="flex flex-col items-center gap-4 text-white/60">
        <FileX className="size-12 text-white/40" />
        <p className="max-w-xs text-center text-sm leading-relaxed">
          Ce format vidéo n&apos;est pas supporté par ce navigateur.<br />
          Télécharge le fichier pour le lire localement.
        </p>
        <Button
          onClick={onDownload}
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
        >
          <Download className="size-4" />
          Télécharger
        </Button>
      </div>
    );
  }

  // Provide explicit type hint so browser can decide early if it can play.
  // Use video/mp4 as fallback — many .mov files are H.264 inside a QuickTime container.
  const sources: string[] = [];
  if (mimeType) sources.push(mimeType);
  if (!sources.includes("video/mp4")) sources.push("video/mp4");
  if (!sources.includes("video/quicktime")) sources.push("video/quicktime");

  return (
    <video
      key={blobUrl}
      controls
      autoPlay
      playsInline
      className="max-h-full max-w-full rounded shadow-2xl"
      onError={() => setCannotPlay(true)}
    >
      {/* Try with declared MIME type first, then fallbacks */}
      {sources.map((t) => (
        <source key={t} src={blobUrl} type={t} />
      ))}
    </video>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PreviewModal({
  driveId,
  fileId,
  siblings = [],
  onClose,
  onNavigate,
}: Props) {
  const file = useFile(driveId, fileId);
  const client = useDiscordClient();

  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [text, setText] = React.useState<string | null>(null);
  const [loadState, setLoadState] = React.useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string>("");
  const [convertingHeic, setConvertingHeic] = React.useState(false);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const currentIdx = fileId ? siblings.indexOf(fileId) : -1;
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx !== -1 && currentIdx < siblings.length - 1;

  const goPrev = React.useCallback(() => {
    if (hasPrev) onNavigate?.(siblings[currentIdx - 1]);
  }, [hasPrev, currentIdx, siblings, onNavigate]);

  const goNext = React.useCallback(() => {
    if (hasNext) onNavigate?.(siblings[currentIdx + 1]);
  }, [hasNext, currentIdx, siblings, onNavigate]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!fileId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fileId, onClose, goPrev, goNext]);

  // ── Download + HEIC conversion + cache blob ────────────────────────────────
  React.useEffect(() => {
    if (!file || !client) return;

    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setText(null);
    setErrorMsg("");
    setConvertingHeic(false);
    setLoadState("loading");

    let cancelled = false;

    client
      .downloadFile({
        size: file.size,
        mimeType: file.mimeType,
        filename: file.filename,
        chunkSize: file.chunkSize,
        chunks: file.chunks,
      })
      .then(async (blob) => {
        if (cancelled) return;

        let finalBlob = blob;
        const ext = getExt(file.filename);

        // ── HEIC/HEIF → JPEG conversion ──────────────────────────────────
        if (HEIC_EXTS.has(ext) || file.mimeType === "image/heic" || file.mimeType === "image/heif") {
          setConvertingHeic(true);
          try {
            finalBlob = await convertHeic(blob);
          } catch {
            // Conversion failed — still try with the original blob (works on Safari)
            finalBlob = blob;
          }
          if (cancelled) return;
          setConvertingHeic(false);
        }

        const url = URL.createObjectURL(finalBlob);
        setBlobUrl(url);

        const kind = kindOf(file.filename, file.mimeType);
        if (isTextKind(kind)) {
          const t = await finalBlob.text();
          if (!cancelled) setText(t);
        }
        setLoadState("done");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg((err as Error).message);
        setLoadState("error");
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  // Revoke on unmount
  React.useEffect(() => {
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  if (!fileId) return null;

  const kind = file ? kindOf(file.filename, file.mimeType) : "";
  const canPreview = PREVIEWABLE_KINDS.has(kind);
  const isLoading = loadState === "loading" || convertingHeic;

  const handleDownload = () => {
    if (!blobUrl || !file) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = file.filename;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{file?.filename ?? "…"}</p>
          {file && <p className="text-xs text-white/40">{formatBytes(file.size)}</p>}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-white/70 hover:bg-white/10 hover:text-white sm:px-3"
          onClick={handleDownload}
          disabled={!blobUrl}
        >
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Télécharger</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>
      </div>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
        {/* Prev button */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="absolute left-2 z-10 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/60 transition-all hover:bg-white/20 hover:text-white sm:left-3 sm:size-10"
          >
            <ChevronLeft className="size-5 sm:size-6" />
          </button>
        )}

        {/* Next button */}
        {hasNext && (
          <button
            onClick={goNext}
            className="absolute right-2 z-10 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/60 transition-all hover:bg-white/20 hover:text-white sm:right-3 sm:size-10"
          >
            <ChevronRight className="size-5 sm:size-6" />
          </button>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 text-white/50">
            <div className="size-9 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
            <p className="text-sm">
              {convertingHeic ? "Conversion HEIC…" : "Chargement…"}
            </p>
          </div>
        )}

        {/* Error */}
        {loadState === "error" && (
          <div className="flex flex-col items-center gap-4 text-red-400">
            <AlertCircle className="size-10" />
            <p className="max-w-xs text-center text-sm">{errorMsg}</p>
          </div>
        )}

        {/* Image */}
        {loadState === "done" && kind === "image" && blobUrl && (
          <img
            src={blobUrl}
            alt={file?.filename}
            className="max-h-full max-w-full select-none rounded object-contain shadow-2xl"
            draggable={false}
          />
        )}

        {/* Video — with unsupported-codec fallback */}
        {loadState === "done" && kind === "video" && blobUrl && (
          <VideoPreview
            blobUrl={blobUrl}
            mimeType={file?.mimeType ?? ""}
            onDownload={handleDownload}
          />
        )}

        {/* Audio */}
        {loadState === "done" && kind === "audio" && blobUrl && (
          <div className="flex flex-col items-center gap-6">
            <div className="flex size-20 items-center justify-center rounded-3xl bg-white/10 sm:size-24">
              <Music className="size-9 text-white/60 sm:size-10" />
            </div>
            <p className="max-w-xs truncate text-center text-sm text-white/70">
              {file?.filename}
            </p>
            <audio
              key={blobUrl}
              src={blobUrl}
              controls
              autoPlay
              className="w-[min(20rem,calc(100vw-3rem))]"
            />
          </div>
        )}

        {/* PDF */}
        {loadState === "done" && kind === "pdf" && blobUrl && (
          <iframe
            key={blobUrl}
            src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="h-full w-full rounded shadow-2xl"
            title={file?.filename}
          />
        )}

        {/* Code / Text */}
        {loadState === "done" && isTextKind(kind) && text !== null && (
          <div className="h-full w-full overflow-auto rounded border border-white/10 bg-zinc-900/80 p-4 shadow-2xl">
            <pre className="break-words whitespace-pre-wrap font-mono text-sm leading-relaxed text-zinc-100">
              {text}
            </pre>
          </div>
        )}

        {/* No preview */}
        {loadState === "done" && !canPreview && (
          <div className="flex flex-col items-center gap-4 text-white/50">
            <FileX className="size-12" />
            <p className="text-sm">Aperçu non disponible pour ce type de fichier.</p>
            <Button
              onClick={handleDownload}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              disabled={!blobUrl}
            >
              <Download className="size-4" />
              Télécharger
            </Button>
          </div>
        )}
      </div>

      {/* Bottom counter */}
      {siblings.length > 1 && currentIdx !== -1 && (
        <div className="shrink-0 pb-3 text-center text-xs text-white/30 select-none">
          {currentIdx + 1} / {siblings.length}
        </div>
      )}
    </div>
  );
}

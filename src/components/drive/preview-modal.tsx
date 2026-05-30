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
import { RichTextPreview } from "@/components/drive/rich-text-preview";

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

/**
 * Extensions whose QuickTime container Chrome rejects even when the codec
 * (H.264) is supported. Relabeling the blob as video/mp4 lets Chrome's
 * media pipeline decode the identical byte stream.
 */
const QUICKTIME_EXTS = new Set(["mov", "qt"]);

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

/**
 * VideoPreview tries the original blob URL first.
 * If the browser can't play it (wrong container/codec), it automatically
 * retries with a video/mp4-typed version (mp4FallbackUrl).
 * This handles .mov from iPhones: H.264 bytes are identical in QT and MP4
 * containers, but Chrome refuses video/quicktime while accepting video/mp4.
 */
function VideoPreview({
  blobUrl,
  mp4FallbackUrl,
  onDownload,
}: {
  blobUrl: string;
  mp4FallbackUrl: string | null;
  onDownload: () => void;
}) {
  const [useFallback, setUseFallback] = React.useState(false);
  const [cannotPlay, setCannotPlay] = React.useState(false);

  const activeUrl = useFallback && mp4FallbackUrl ? mp4FallbackUrl : blobUrl;

  const handleError = React.useCallback(() => {
    if (!useFallback && mp4FallbackUrl) {
      // First failure: retry as video/mp4
      setUseFallback(true);
    } else {
      // Already retried (or no fallback): give up, show download
      setCannotPlay(true);
    }
  }, [useFallback, mp4FallbackUrl]);

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

  return (
    <video
      key={activeUrl}
      src={activeUrl}
      controls
      autoPlay
      playsInline
      className="max-h-full max-w-full rounded shadow-2xl"
      onError={handleError}
    />
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
  /** Pre-built video/mp4-typed URL for .mov fallback (null if not applicable). */
  const [mp4FallbackUrl, setMp4FallbackUrl] = React.useState<string | null>(null);
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

    setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setMp4FallbackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
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

        // ── MOV / QuickTime → pre-build mp4 fallback URL ──────────────────
        // On PC, Chrome may play video/quicktime directly via system codecs.
        // On Android/other, it can't → VideoPreview retries with this URL.
        // We prepare it upfront (same bytes, different MIME) so the retry
        // is instant with no extra download.
        if (QUICKTIME_EXTS.has(ext) || file.mimeType === "video/quicktime") {
          const mp4Blob = new Blob([finalBlob], { type: "video/mp4" });
          setMp4FallbackUrl(URL.createObjectURL(mp4Blob));
        } else {
          setMp4FallbackUrl(null);
        }

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

  // Revoke blob URLs on unmount
  React.useEffect(() => {
    return () => {
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setMp4FallbackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
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

        {/* Video — tries original, auto-retries as mp4 for .mov if needed */}
        {loadState === "done" && kind === "video" && blobUrl && (
          <VideoPreview
            blobUrl={blobUrl}
            mp4FallbackUrl={mp4FallbackUrl}
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

        {/* Code / Text / Markdown */}
        {loadState === "done" && isTextKind(kind) && text !== null && file && (
          <div className="h-full w-full">
            <RichTextPreview text={text} filename={file.filename} />
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

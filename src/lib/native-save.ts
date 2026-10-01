"use client";

import { isNativeApp } from "@/lib/use-platform";
import { toast } from "sonner";
import { kindOf } from "@/lib/utils/file-icons";

export type SaveDestination = "gallery" | "files" | "web";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = r.result as string;
      resolve(s.slice(s.indexOf(",") + 1)); // strip "data:...;base64,"
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Save a blob to the device.
 *  - Web: triggers a normal browser download.
 *  - App: images/videos → Photos gallery; everything else → the Files app in a
 *    "Drivecord" folder (the app's Documents directory).
 * Returns where it was saved (for a toast).
 */
export async function saveBlob(blob: Blob, filename: string, mimeType = ""): Promise<SaveDestination> {
  if (!isNativeApp()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    // Attached to the DOM: some browsers (Firefox) ignore clicks on detached anchors.
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "web";
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const kind = kindOf(filename, mimeType);
  const safeName = sanitizeFilename(filename);

  if (kind === "image" || kind === "video") {
    // Stage in cache, then hand the file URI to the Photos gallery.
    const cacheName = `dc-${Date.now()}-${safeName}`;
    try {
      const uri = await writeBlobChunked(Filesystem, blob, cacheName, Directory.Cache);
      const { Media } = await import("@capacitor-community/media");
      if (kind === "video") await Media.saveVideo({ path: uri });
      else await Media.savePhoto({ path: uri });
      return "gallery";
    } catch {
      // Photos refuses many formats (SVG, PSD, WebM, MKV…) or access was
      // denied: keep the file anyway, in Files › Drivecord, below.
    } finally {
      await Filesystem.deleteFile({ path: cacheName, directory: Directory.Cache }).catch(() => {});
    }
  }

  // Everything else → Files app, in a "Drivecord" folder.
  await Filesystem.mkdir({ path: "Drivecord", directory: Directory.Documents, recursive: true }).catch(() => {});
  const target = await freeName(Filesystem, Directory.Documents, "Drivecord", safeName);
  await writeBlobChunked(Filesystem, blob, `Drivecord/${target}`, Directory.Documents);
  return "files";
}

/**
 * `saveBlob` for one-off buttons (preview, recovery key, share page…), with
 * feedback: in the app a file lands in Photos or Files — say where, since
 * nothing like a browser download bar shows it. Never throws.
 */
export async function saveBlobWithToast(blob: Blob, filename: string, mimeType = ""): Promise<void> {
  try {
    const dest = await saveBlob(blob, filename, mimeType);
    if (dest === "gallery") toast.success(`« ${filename} » enregistré dans Photos`);
    else if (dest === "files") toast.success(`« ${filename} » enregistré dans Fichiers › Drivecord`);
  } catch (e) {
    toast.error(`Enregistrement impossible : ${(e as Error).message}`);
  }
}

type Fs = typeof import("@capacitor/filesystem").Filesystem;
type Dir = import("@capacitor/filesystem").Directory;

// 3 MiB (a multiple of 3, so every slice is a standalone base64 run).
const WRITE_CHUNK = 3 * 1024 * 1024;

/**
 * Write a blob to disk in slices: the plugin bridge only takes base64 strings,
 * and one string for a whole video (+33 %) blew the WebView's memory.
 * Returns the written file's URI.
 */
async function writeBlobChunked(fs: Fs, blob: Blob, path: string, directory: Dir): Promise<string> {
  const first = await fs.writeFile({ path, directory, data: await blobToBase64(blob.slice(0, WRITE_CHUNK)) });
  for (let off = WRITE_CHUNK; off < blob.size; off += WRITE_CHUNK) {
    await fs.appendFile({ path, directory, data: await blobToBase64(blob.slice(off, off + WRITE_CHUNK)) });
  }
  return first.uri;
}

/** A file name usable on disk: no path separators or control characters. */
function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\/:\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();
  return clean.slice(0, 200) || "fichier";
}

/** `name`, or `name (2)`, `name (3)`… if a file already has it in `folder`. */
async function freeName(fs: Fs, directory: Dir, folder: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? name : `${base} (${i})${ext}`;
    try {
      await fs.stat({ path: `${folder}/${candidate}`, directory });
    } catch {
      return candidate; // stat failed → nothing there
    }
  }
  return `${base}-${Date.now()}${ext}`;
}

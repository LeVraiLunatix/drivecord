"use client";

import { isNativeApp } from "@/lib/use-platform";
import { toast } from "sonner";
import { kindOf } from "@/lib/utils/file-icons";

export type SaveDestination = "gallery" | "files" | "web";

/** Where bytes go while a file is being saved: written as they arrive, committed by `finish`. */
export type SaveSink = {
  write(data: Blob): Promise<void>;
  /** Commit (gallery import, browser download…). Returns where the file ended up. */
  finish(): Promise<SaveDestination>;
  /** Throw away a half-written file. Never throws. */
  abort(): Promise<void>;
};

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

// Above this, a browser that can write to disk streams the file instead of keeping it in RAM.
const WEB_STREAM_MIN = 64 * 1024 * 1024;

type FsWritable = { write(d: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type SavePicker = (o: { suggestedName: string }) => Promise<{ createWritable(): Promise<FsWritable> }>;

/**
 * Open a destination for a file that arrives in pieces.
 *  - App: the pieces are appended to disk (images/videos are staged, then imported into Photos;
 *    everything else lands in Files › Drivecord). Memory use stays flat whatever the size.
 *  - Web, `preferDisk` and a big file, on a browser with the File System Access API: written
 *    straight to the file the user picks. Must be called while the click is still "fresh".
 *  - Web otherwise: pieces are kept and handed to the browser as one download.
 */
export async function openSaveSink(
  filename: string,
  mimeType = "",
  opts: { size?: number; preferDisk?: boolean } = {},
): Promise<SaveSink> {
  if (!isNativeApp()) {
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    if (opts.preferDisk && picker && (opts.size ?? 0) >= WEB_STREAM_MIN) {
      const handle = await picker({ suggestedName: filename }); // AbortError = user cancelled
      const w = await handle.createWritable();
      return {
        write: (d) => w.write(d),
        finish: async () => { await w.close(); return "web"; },
        abort: () => w.abort().catch(() => {}),
      };
    }
    const parts: Blob[] = [];
    return {
      write: async (d) => void parts.push(d),
      finish: async () => { triggerBrowserDownload(new Blob(parts, { type: mimeType || undefined }), filename); return "web"; },
      abort: async () => void (parts.length = 0),
    };
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const kind = kindOf(filename, mimeType);
  const safeName = sanitizeFilename(filename);
  const toGallery = kind === "image" || kind === "video";

  // Gallery imports are staged in the cache; everything else is written to its final place.
  const stageName = `dc-${Date.now()}-${safeName}`;
  let path = stageName;
  let directory = Directory.Cache;
  let uri = "";
  let started = false;
  if (!toGallery) {
    await Filesystem.mkdir({ path: "Drivecord", directory: Directory.Documents, recursive: true }).catch(() => {});
    path = `Drivecord/${await freeName(Filesystem, Directory.Documents, "Drivecord", safeName)}`;
    directory = Directory.Documents;
  }

  const remove = () => Filesystem.deleteFile({ path, directory }).catch(() => {});

  const sink: SaveSink = {
    async write(data) {
      let off = 0;
      do {
        const b64 = await blobToBase64(data.slice(off, off + WRITE_CHUNK));
        if (!started) {
          uri = (await Filesystem.writeFile({ path, directory, data: b64 })).uri;
          started = true;
        } else {
          await Filesystem.appendFile({ path, directory, data: b64 });
        }
        off += WRITE_CHUNK;
      } while (off < data.size);
    },
    async finish() {
      if (!started) await sink.write(new Blob([]));
      if (!toGallery) return "files";
      try {
        const { Media } = await import("@capacitor-community/media");
        if (kind === "video") await Media.saveVideo({ path: uri });
        else await Media.savePhoto({ path: uri });
        return "gallery";
      } catch {
        // Photos refuses many formats (SVG, PSD, WebM, MKV…) or access was denied:
        // keep the file anyway, in Files › Drivecord.
        await Filesystem.mkdir({ path: "Drivecord", directory: Directory.Documents, recursive: true }).catch(() => {});
        const target = await freeName(Filesystem, Directory.Documents, "Drivecord", safeName);
        await Filesystem.copy({ from: path, directory: Directory.Cache, to: `Drivecord/${target}`, toDirectory: Directory.Documents });
        return "files";
      } finally {
        await remove();
      }
    },
    abort: remove,
  };
  return sink;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
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
}

/**
 * Save a blob that is already in memory.
 *  - Web: triggers a normal browser download.
 *  - App: images/videos → Photos gallery; everything else → the Files app in a
 *    "Drivecord" folder (the app's Documents directory).
 * Returns where it was saved (for a toast).
 */
export async function saveBlob(blob: Blob, filename: string, mimeType = ""): Promise<SaveDestination> {
  const sink = await openSaveSink(filename, mimeType);
  try {
    await sink.write(blob);
    return await sink.finish();
  } catch (e) {
    await sink.abort();
    throw e;
  }
}

/**
 * `saveBlob` for one-off buttons (share page, recovery key…), with feedback: in the app a file
 * lands in Photos or Files — say where, since nothing like a browser download bar shows it.
 * Never throws.
 */
export async function saveBlobWithToast(blob: Blob, filename: string, mimeType = ""): Promise<void> {
  try {
    toastSaved(filename, await saveBlob(blob, filename, mimeType));
  } catch (e) {
    toast.error(`Enregistrement impossible : ${(e as Error).message}`);
  }
}

/** The success toast shared by every save path. */
export function toastSaved(filename: string, dest: SaveDestination, id?: string | number): void {
  if (dest === "gallery") toast.success(`« ${filename} » enregistré dans Photos`, { id });
  else if (dest === "files") toast.success(`« ${filename} » enregistré dans Fichiers › Drivecord`, { id });
  else toast.success(`« ${filename} » téléchargé`, { id });
}

type Fs = typeof import("@capacitor/filesystem").Filesystem;
type Dir = import("@capacitor/filesystem").Directory;

// 3 MiB (a multiple of 3, so every slice is a standalone base64 run). The plugin bridge only
// takes base64 strings: one string for a whole video (+33 %) blew the WebView's memory.
const WRITE_CHUNK = 3 * 1024 * 1024;

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

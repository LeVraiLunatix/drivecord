"use client";

import { isNativeApp } from "@/lib/use-platform";
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
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "web";
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const base64 = await blobToBase64(blob);
  const kind = kindOf(filename, mimeType);

  if (kind === "image" || kind === "video") {
    // Stage in cache, then hand the file URI to the Photos gallery.
    const cacheName = `dc-${Date.now()}-${filename}`;
    const tmp = await Filesystem.writeFile({
      path: cacheName,
      data: base64,
      directory: Directory.Cache,
    });
    try {
      const { Media } = await import("@capacitor-community/media");
      if (kind === "video") await Media.saveVideo({ path: tmp.uri });
      else await Media.savePhoto({ path: tmp.uri });
    } finally {
      await Filesystem.deleteFile({ path: cacheName, directory: Directory.Cache }).catch(() => {});
    }
    return "gallery";
  }

  // Everything else → Files app, in a "Drivecord" folder.
  await Filesystem.mkdir({ path: "Drivecord", directory: Directory.Documents, recursive: true }).catch(() => {});
  await Filesystem.writeFile({
    path: `Drivecord/${filename}`,
    data: base64,
    directory: Directory.Documents,
  });
  return "files";
}

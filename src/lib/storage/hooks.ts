"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import {
  ACTIVE_DRIVE_EVENT_NAME,
  getActiveDriveId,
  setActiveDriveId,
  clearActiveDriveId,
} from "./drives";
import {
  ROOT_PARENT,
  type Drive,
  type DriveItem,
  type FileEntry,
  type FolderEntry,
  type ParentId,
} from "./schema";

function toPid(p: ParentId | null | undefined): ParentId {
  return p ?? ROOT_PARENT;
}

/**
 * Subscribe to the active drive id stored in localStorage.
 * Updates reactively on cross-tab changes via the `storage` event.
 */
export function useActiveDriveId(): [string | null, (id: string | null) => void] {
  const [id, setId] = React.useState<string | null>(() => getActiveDriveId());

  React.useEffect(() => {
    // Cross-tab updates: the browser `storage` event fires in OTHER tabs.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "discloud:activeDriveId") setId(e.newValue);
    };
    // Same-tab updates: a custom event we dispatch from setActiveDriveId.
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<string | null>).detail;
      setId(detail ?? null);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ACTIVE_DRIVE_EVENT_NAME, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACTIVE_DRIVE_EVENT_NAME, onCustom);
    };
  }, []);

  const setAndPersist = React.useCallback((next: string | null) => {
    if (next) setActiveDriveId(next);
    else clearActiveDriveId();
    setId(next);
  }, []);

  return [id, setAndPersist];
}

export function useActiveDrive(): Drive | undefined {
  const [id] = useActiveDriveId();
  return useLiveQuery(
    async () => (id ? await db().drives.get(id) : undefined),
    [id],
  );
}

export function useAllDrives(): Drive[] | undefined {
  return useLiveQuery(
    async () => await db().drives.orderBy("lastOpenedAt").reverse().toArray(),
    [],
  );
}

/** Direct children (folders + files) of `parentId` inside the active drive. */
export function useDriveItems(
  driveId: string | null,
  parentId: ParentId | null,
): DriveItem[] | undefined {
  return useLiveQuery(
    async () => {
      if (!driveId) return [];
      const pid = toPid(parentId);
      const [folders, files] = await Promise.all([
        db()
          .folders.where("[driveId+parentId]")
          .equals([driveId, pid])
          .toArray(),
        db()
          .files.where("[driveId+parentId]")
          .equals([driveId, pid])
          .toArray(),
      ]);
      const out: DriveItem[] = [];
      for (const f of folders) if (!f.trashed) out.push({ kind: "folder", ...f });
      for (const f of files) if (!f.trashed) out.push({ kind: "file", ...f });
      // Folders first, then files; both alphabetic.
      out.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        const an = a.kind === "folder" ? a.name : a.filename;
        const bn = b.kind === "folder" ? b.name : b.filename;
        return an.localeCompare(bn, "fr", { numeric: true });
      });
      return out;
    },
    [driveId, parentId],
  );
}

export function useFolderPath(
  folderId: ParentId | null,
): FolderEntry[] | undefined {
  return useLiveQuery(
    async () => {
      const start = toPid(folderId);
      if (start === ROOT_PARENT) return [];
      const path: FolderEntry[] = [];
      let cur: ParentId = start;
      const guard = new Set<string>();
      while (cur && cur !== ROOT_PARENT && !guard.has(cur)) {
        guard.add(cur);
        const row: FolderEntry | undefined = await db().folders.get(cur);
        if (!row) break;
        path.unshift(row);
        cur = row.parentId;
      }
      return path;
    },
    [folderId],
  );
}

export function useFile(id: string | null): FileEntry | undefined {
  return useLiveQuery(
    async () => (id ? await db().files.get(id) : undefined),
    [id],
  );
}

/** Live count of direct children inside a folder (folders + non-trashed files). */
export function useFolderItemCount(
  driveId: string | null,
  folderId: string,
): number | undefined {
  return useLiveQuery(
    async () => {
      if (!driveId) return 0;
      const [folders, files] = await Promise.all([
        db()
          .folders.where("[driveId+parentId]")
          .equals([driveId, folderId])
          .filter((r) => !r.trashed)
          .count(),
        db()
          .files.where("[driveId+parentId]")
          .equals([driveId, folderId])
          .filter((r) => !r.trashed)
          .count(),
      ]);
      return folders + files;
    },
    [driveId, folderId],
  );
}

/** All unique tags used across a drive (reactive). */
export function useAllTags(
  driveId: string | null,
): { tag: string; count: number }[] | undefined {
  return useLiveQuery(
    async () => {
      if (!driveId) return [];
      const files = await db()
        .files.where("driveId")
        .equals(driveId)
        .filter((f) => !f.trashed && f.tags.length > 0)
        .toArray();
      const counts = new Map<string, number>();
      for (const file of files) {
        for (const tag of file.tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => a.tag.localeCompare(b.tag, "fr"));
    },
    [driveId],
  );
}

/** All non-trashed files in a drive that carry a given tag (reactive). */
export function useFilesByTag(
  driveId: string | null,
  tag: string | null,
): DriveItem[] | undefined {
  return useLiveQuery(
    async () => {
      if (!driveId || !tag) return [];
      const files = await db()
        .files.where("tags")
        .equals(tag)
        .filter((f) => f.driveId === driveId && !f.trashed)
        .toArray();
      files.sort((a, b) =>
        a.filename.localeCompare(b.filename, "fr", { numeric: true }),
      );
      return files.map((f) => ({ kind: "file" as const, ...f }));
    },
    [driveId, tag],
  );
}

export function useDriveUsage(
  driveId: string | null,
): { fileCount: number; totalBytes: number } | undefined {
  return useLiveQuery(
    async () => {
      if (!driveId) return { fileCount: 0, totalBytes: 0 };
      let fileCount = 0;
      let totalBytes = 0;
      await db()
        .files.where("driveId")
        .equals(driveId)
        .each((f) => {
          if (f.trashed) return;
          fileCount++;
          totalBytes += f.size;
        });
      return { fileCount, totalBytes };
    },
    [driveId],
  );
}

"use client";

import * as React from "react";
import useSWR from "swr";
import {
  ACTIVE_DRIVE_EVENT_NAME,
  getActiveDriveId,
  setActiveDriveId,
  clearActiveDriveId,
} from "./drives";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ROOT_PARENT,
  type Drive,
  type DriveItem,
  type FileEntry,
  type FolderEntry,
  type ParentId,
} from "./schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Active drive (stays in IndexedDB / localStorage) ──────────────────────────

export function useActiveDriveId(): [string | null, (id: string | null) => void] {
  const [id, setId] = React.useState<string | null>(() => getActiveDriveId());

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "drivecord:activeDriveId") setId(e.newValue);
    };
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

/** Active Drive record from IndexedDB (drives stay local). */
export function useActiveDrive(): Drive | undefined {
  const [id] = useActiveDriveId();
  return useLiveQuery(
    async () => (id ? db().drives.get(id) : undefined),
    [id],
  );
}

/** All drives (IndexedDB). */
export function useAllDrives(): Drive[] | undefined {
  return useLiveQuery(
    async () => db().drives.orderBy("lastOpenedAt").reverse().toArray(),
    [],
  );
}

// ── Server-backed hooks (SWR) ─────────────────────────────────────────────────

/** Direct children (folders + files) of `parentId` inside a drive. */
export function useDriveItems(
  driveId: string | null,
  parentId: ParentId | null,
): DriveItem[] | undefined {
  const pid = parentId ?? ROOT_PARENT;
  const { data } = useSWR(
    driveId ? `/api/drive/${driveId}/items?parentId=${encodeURIComponent(pid)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.items as DriveItem[] | undefined;
}

/** Files flagged as favorite in a drive. */
export function useFavorites(driveId: string | null): DriveItem[] | undefined {
  const { data } = useSWR(
    driveId ? `/api/drive/${driveId}/items?view=favorites` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.items as DriveItem[] | undefined;
}

/** Locked files in the vault. Pass enabled=false to skip fetching until unlocked. */
export function useVaultItems(driveId: string | null, enabled = true): DriveItem[] | undefined {
  const { data } = useSWR(
    driveId && enabled ? `/api/drive/${driveId}/items?view=vault` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.items as DriveItem[] | undefined;
}

/** All trashed items in a drive. */
export function useTrashedItems(driveId: string | null): DriveItem[] | undefined {
  const { data } = useSWR(
    driveId ? `/api/drive/${driveId}/items?view=trash` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.items as DriveItem[] | undefined;
}

/** Files with a given tag. */
export function useFilesByTag(
  driveId: string | null,
  tag: string | null,
): DriveItem[] | undefined {
  const { data } = useSWR(
    driveId && tag ? `/api/drive/${driveId}/items?tag=${encodeURIComponent(tag)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.items as DriveItem[] | undefined;
}

/** Breadcrumb path from root to folderId. */
export function useFolderPath(
  driveId: string | null,
  folderId: ParentId | null,
): FolderEntry[] | undefined {
  const pid = folderId ?? ROOT_PARENT;
  const { data } = useSWR(
    driveId && pid !== ROOT_PARENT
      ? `/api/drive/${driveId}/folder-path?folderId=${encodeURIComponent(pid)}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  if (!folderId || folderId === ROOT_PARENT) return [];
  return data?.path as FolderEntry[] | undefined;
}

/** Single file (with SWR caching). */
export function useFile(driveId: string | null, id: string | null): FileEntry | undefined {
  const { data } = useSWR(
    driveId && id ? `/api/drive/${driveId}/files/${id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data as FileEntry | undefined;
}

/** Child count for a folder badge (folder items list). */
export function useFolderItemCount(
  driveId: string | null,
  folderId: string,
): number | undefined {
  // We re-use the items SWR key for the folder's children.
  const { data } = useSWR(
    driveId ? `/api/drive/${driveId}/items?parentId=${encodeURIComponent(folderId)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10_000 },
  );
  if (!data?.items) return undefined;
  return (data.items as DriveItem[]).length;
}

/** All unique tags across a drive. */
export function useAllTags(
  driveId: string | null,
): { tag: string; count: number }[] | undefined {
  const { data } = useSWR(
    driveId ? `/api/drive/${driveId}/tags` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.tags as { tag: string; count: number }[] | undefined;
}

/** Drive storage usage. */
export function useDriveUsage(
  driveId: string | null,
): { fileCount: number; totalBytes: number } | undefined {
  const { data } = useSWR(
    driveId ? `/api/drive/${driveId}/usage` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data as { fileCount: number; totalBytes: number } | undefined;
}

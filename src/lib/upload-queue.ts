"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  DiscordClient,
  FileManifest,
  UploadProgress,
} from "@/lib/discord";
import { recordUploadedFile } from "@/lib/storage";
import type { ParentId } from "@/lib/storage";
import { encryptBlob } from "@/lib/crypto/vault-crypto";

/**
 * Global upload queue.
 *
 * One file at a time on the upload pipeline — each individual upload already
 * parallelizes its chunks (4 in flight). Stacking files on top would quickly
 * saturate Discord rate limits.
 *
 * The queue is reactive: components subscribe via `useUploadQueue()` and
 * re-render as items move through pending → uploading → done/error.
 */

export type QueueStatus =
  | "pending"
  | "uploading"
  | "done"
  | "error"
  | "cancelled";

export type QueueItem = {
  id: string;
  fileName: string;
  fileSize: number;
  driveId: string;
  parentId: ParentId;
  status: QueueStatus;
  progress: UploadProgress | null;
  error?: string;
  fileEntryId?: string;
  startedAt?: number;
  endedAt?: number;
};

type InternalQueueItem = QueueItem & {
  /** Not part of the public type — kept here to actually run the upload. */
  _file: File;
  _abort: AbortController;
  /** When set, the file is E2EE-encrypted (vault) before upload. */
  _encryptKey?: CryptoKey;
};

type UploadQueueState = {
  items: QueueItem[];
  enqueue: (params: {
    files: File[];
    driveId: string;
    parentId: ParentId;
    client: DiscordClient;
    /** When provided, files are AES-GCM encrypted before upload + marked locked. */
    encryptKey?: CryptoKey;
    onUploaded?: (item: QueueItem, manifest: FileManifest) => void;
  }) => string[];
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  // Internal: called by enqueue's pump.
  _setItem: (id: string, patch: Partial<InternalQueueItem>) => void;
  _internal: Map<string, InternalQueueItem>;
  _pumping: boolean;
  _pump: () => Promise<void>;
};

export const useUploadQueue = create<UploadQueueState>((set, get) => ({
  items: [],
  _internal: new Map(),
  _pumping: false,

  _setItem: (id, patch) => {
    const map = get()._internal;
    const cur = map.get(id);
    if (!cur) return;
    const next = { ...cur, ...patch } as InternalQueueItem;
    map.set(id, next);
    set({
      items: Array.from(map.values()).map(stripInternal),
    });
  },

  enqueue: ({ files, driveId, parentId, client, encryptKey, onUploaded }) => {
    const ids: string[] = [];
    const map = get()._internal;
    for (const f of files) {
      const id = nanoid(8);
      const item: InternalQueueItem = {
        id,
        fileName: f.name,
        fileSize: f.size,
        driveId,
        parentId,
        status: "pending",
        progress: null,
        _file: f,
        _abort: new AbortController(),
        _encryptKey: encryptKey,
      };
      map.set(id, item);
      ids.push(id);
    }
    set({ items: Array.from(map.values()).map(stripInternal) });

    // Kick the pump.
    const pump = async () => {
      if (get()._pumping) return;
      set({ _pumping: true });
      try {
        while (true) {
          const map = get()._internal;
          const next = Array.from(map.values()).find(
            (i) => i.status === "pending",
          );
          if (!next) break;
          await runOne(next, client, get()._setItem, onUploaded);
        }
      } finally {
        set({ _pumping: false });
      }
    };
    pump();
    return ids;
  },

  cancel: (id) => {
    const map = get()._internal;
    const item = map.get(id);
    if (!item) return;
    if (item.status === "uploading" || item.status === "pending") {
      item._abort.abort();
      get()._setItem(id, { status: "cancelled", endedAt: Date.now() });
    }
  },

  remove: (id) => {
    const map = get()._internal;
    map.delete(id);
    set({ items: Array.from(map.values()).map(stripInternal) });
  },

  clearFinished: () => {
    const map = get()._internal;
    for (const [id, it] of map) {
      if (it.status === "done" || it.status === "cancelled" || it.status === "error") {
        map.delete(id);
      }
    }
    set({ items: Array.from(map.values()).map(stripInternal) });
  },

  // unused placeholder so the type checks — actual pump is inline in enqueue
  _pump: async () => {},
}));

function stripInternal(item: InternalQueueItem): QueueItem {
  // Don't leak File refs / abort controllers into React render trees.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _file, _abort, _encryptKey, ...rest } = item;
  return rest;
}

async function runOne(
  item: InternalQueueItem,
  client: DiscordClient,
  setItem: UploadQueueState["_setItem"],
  onUploaded?: (item: QueueItem, manifest: FileManifest) => void,
): Promise<void> {
  setItem(item.id, { status: "uploading", startedAt: Date.now() });
  try {
    // E2EE: encrypt the bytes before upload, preserving the original name/type
    // in the manifest so display + decryption work transparently.
    let uploadFile = item._file;
    let encIv: string | undefined;
    if (item._encryptKey) {
      const { blob, iv } = await encryptBlob(item._file, item._encryptKey);
      uploadFile = new File([blob], item._file.name, { type: item._file.type });
      encIv = iv;
    }

    const manifest = await client.uploadFile(uploadFile, {
      signal: item._abort.signal,
      onProgress: (p) => setItem(item.id, { progress: p }),
    });
    const fileEntryId = await recordUploadedFile({
      driveId: item.driveId,
      parentId: item.parentId,
      manifest,
      locked: Boolean(item._encryptKey),
      encIv,
    });
    setItem(item.id, {
      status: "done",
      endedAt: Date.now(),
      fileEntryId,
    });
    onUploaded?.(stripInternal({ ...item, fileEntryId, status: "done" } as InternalQueueItem), manifest);
  } catch (err) {
    if (item._abort.signal.aborted) {
      setItem(item.id, { status: "cancelled", endedAt: Date.now() });
    } else {
      setItem(item.id, {
        status: "error",
        endedAt: Date.now(),
        error: (err as Error).message,
      });
    }
  }
}

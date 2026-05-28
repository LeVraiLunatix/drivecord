import Dexie, { type EntityTable } from "dexie";
import type {
  Drive,
  FileEntry,
  FolderEntry,
  ShareEntry,
} from "./schema";

/**
 * The Drivecord IndexedDB database.
 *
 * Versioning policy: bump the version + add a `db.version(N).stores({...}).upgrade()`
 * whenever the schema changes. Never mutate an existing version block.
 *
 * Note on indexes:
 *  - `[driveId+parentId]` is a compound index used by the explorer to list
 *    items inside one folder of one drive in a single range query.
 *  - `[driveId+trashed]` powers the trash view.
 *  - `*tags` is a multi-entry index — each array element becomes its own key.
 */
export class DrivecordDB extends Dexie {
  drives!: EntityTable<Drive, "id">;
  folders!: EntityTable<FolderEntry, "id">;
  files!: EntityTable<FileEntry, "id">;
  shares!: EntityTable<ShareEntry, "id">;

  constructor() {
    super("drivecord");
    this.version(1).stores({
      drives: "id, createdAt, lastOpenedAt",
      folders:
        "id, driveId, parentId, [driveId+parentId], [driveId+trashed], createdAt, updatedAt",
      files:
        "id, driveId, parentId, [driveId+parentId], [driveId+trashed], [driveId+favorite], createdAt, updatedAt, filename, *tags",
      shares: "id, driveId, fileId, token, expiresAt, createdAt",
    });
  }
}

/** Module-level singleton (one Dexie instance per page). */
let _db: DrivecordDB | null = null;

export function db(): DrivecordDB {
  if (typeof window === "undefined") {
    // Dexie can technically work in workers, but during Next.js SSR there is
    // no IndexedDB. Calling this on the server is a bug.
    throw new Error("DrivecordDB.db() called on the server");
  }
  if (!_db) _db = new DrivecordDB();
  return _db;
}

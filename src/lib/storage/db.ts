import Dexie, { type EntityTable } from "dexie";
import type { Drive, ShareEntry } from "./schema";

/**
 * The Drivecord IndexedDB database.
 *
 * Only drives (webhook URLs — never sent to server) and shares stay here.
 * Files and folders are now stored in Neon (server-side) for cross-device sync.
 */
export class DrivecordDB extends Dexie {
  drives!: EntityTable<Drive, "id">;
  shares!: EntityTable<ShareEntry, "id">;

  constructor() {
    super("drivecord");
    this.version(1).stores({
      drives: "id, createdAt, lastOpenedAt",
      // v1 had folders/files tables — migration away from IndexedDB
      folders: "id, driveId, parentId, [driveId+parentId], [driveId+trashed], createdAt, updatedAt",
      files: "id, driveId, parentId, [driveId+parentId], [driveId+trashed], [driveId+favorite], createdAt, updatedAt, filename, *tags",
      shares: "id, driveId, fileId, token, expiresAt, createdAt",
    });
    this.version(2).stores({
      // Drop files and folders tables; drives and shares remain.
      drives: "id, createdAt, lastOpenedAt",
      folders: null,
      files: null,
      shares: "id, driveId, fileId, token, expiresAt, createdAt",
    });
  }
}

let _db: DrivecordDB | null = null;

export function db(): DrivecordDB {
  if (typeof window === "undefined") {
    throw new Error("DrivecordDB.db() called on the server");
  }
  if (!_db) _db = new DrivecordDB();
  return _db;
}

"use client";

/** Tiny IndexedDB key/value store for device-local E2EE state (kept out of Dexie on purpose). */
const DB_NAME = "drivecord-e2ee";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const idbGet = <T>(key: string) => tx<T | undefined>("readonly", (s) => s.get(key));
export const idbSet = (key: string, value: unknown) => tx("readwrite", (s) => s.put(value, key)).then(() => undefined);
export const idbDel = (key: string) => tx("readwrite", (s) => s.delete(key)).then(() => undefined);

"use client";

/**
 * Drive keys (DK): one per drive, wrapped by the Master Key on the server, cached
 * here (raw bytes + imported CryptoKey) while the keyring is unlocked.
 *
 * Also owns the migration of legacy drives (server-held key → end-to-end): the old
 * raw key BECOMES the drive key, so every file already encrypted with it stays readable.
 */
import { authFetch } from "@/lib/api-base";
import { b64decode, b64encode, generateDriveKey, importAesKey, unwrapDriveKey, wrapDriveKey } from "@/lib/crypto/e2ee";
import { unwrapDriveKeyFromLocalStorage } from "@/lib/crypto/drive-crypto";
import { db } from "@/lib/storage/db";
import type { Drive } from "@/lib/storage/schema";
import { getMk, isUnlocked } from "./keyring";

export type DriveKeyMaterial = { raw: Uint8Array; key: CryptoKey };

const cache = new Map<string, DriveKeyMaterial>();

export function clearDriveKeyCache() {
  cache.clear();
}

async function material(raw: Uint8Array): Promise<DriveKeyMaterial> {
  return { raw, key: await importAesKey(raw) };
}

/** The drive's key. Needs the keyring unlocked and the drive migrated (`e2eeVersion` ≥ 1). */
export async function getDriveKeyMaterial(drive: Pick<Drive, "id" | "dkWrapped" | "e2eeVersion">): Promise<DriveKeyMaterial> {
  const hit = cache.get(drive.id);
  if (hit) return hit;
  if (!drive.dkWrapped || (drive.e2eeVersion ?? 0) < 1) {
    throw new Error("Ce drive n'est pas encore chiffré de bout en bout.");
  }
  const m = await material(await unwrapDriveKey(getMk(), drive.id, drive.dkWrapped));
  cache.set(drive.id, m);
  return m;
}

export async function getDriveKeyMaterialById(driveId: string): Promise<DriveKeyMaterial> {
  const drive = await db().drives.get(driveId);
  if (!drive) throw new Error("Drive introuvable.");
  return getDriveKeyMaterial(drive);
}

/** Non-throwing variant for UI code paths that can degrade gracefully. */
export async function tryGetDriveKeyMaterial(driveId: string): Promise<DriveKeyMaterial | null> {
  if (!isUnlocked()) return null;
  try {
    return await getDriveKeyMaterialById(driveId);
  } catch (err) {
    console.warn("[e2ee] clé du drive inaccessible :", (err as Error).message);
    return null;
  }
}

async function postJson(path: string, body: unknown) {
  const res = await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Erreur serveur.");
  return data;
}

/** Fetch the legacy raw key from the server one last time (only ever returned while e2eeVersion = 0). */
async function fetchLegacyKey(driveId: string): Promise<Uint8Array | null> {
  const res = await authFetch("/api/webhooks");
  if (!res.ok) return null;
  const list = (await res.json()) as { driveId: string; encKey?: string | null }[];
  const k = list.find((w) => w.driveId === driveId)?.encKey;
  return k ? b64decode(k) : null;
}

/**
 * Bring one drive under end-to-end encryption. Idempotent. The old server-side key (if any)
 * is promoted to DK; a drive that never had one gets a fresh random DK.
 */
export async function migrateDrive(drive: Drive): Promise<Drive> {
  if ((drive.e2eeVersion ?? 0) >= 1 && drive.dkWrapped) return drive;
  const mk = getMk();

  let raw: Uint8Array | null = null;
  if (drive.encKey) {
    try {
      raw = b64decode(await unwrapDriveKeyFromLocalStorage(drive.encKey));
    } catch {
      raw = null;
    }
  }
  raw ??= await fetchLegacyKey(drive.id);
  raw ??= generateDriveKey();

  const dkWrapped = await wrapDriveKey(mk, drive.id, raw);
  await postJson(`/api/drive/${drive.id}/e2ee/finalize`, { dkWrapped });
  const next: Drive = { ...drive, dkWrapped, e2eeVersion: 1, encKey: undefined };
  await db().drives.put(next);
  cache.set(drive.id, await material(raw));
  return next;
}

/** Migrate every local drive still on the legacy scheme. Returns how many were migrated. */
export async function migrateAllDrives(): Promise<number> {
  let n = 0;
  for (const d of await db().drives.toArray()) {
    if ((d.e2eeVersion ?? 0) < 1) {
      await migrateDrive(d);
      n++;
    }
  }
  return n;
}

/** Wrap a brand-new drive key for a drive being created (returns the blob to send to the server). */
export async function createDriveKeyForNewDrive(driveId: string) {
  const raw = generateDriveKey();
  const dkWrapped = await wrapDriveKey(getMk(), driveId, raw);
  cache.set(driveId, await material(raw));
  return { dkWrapped, raw };
}

export { b64encode };

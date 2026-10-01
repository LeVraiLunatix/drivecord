/**
 * Syncs server-side webhooks into the local IndexedDB on login.
 *
 * Strategy:
 *   1. Fetch all webhooks from /api/webhooks (decrypted on server, URL sent back)
 *   2. For each server webhook: upsert the local Drive row via addDriveFromWebhook
 *      (but skip the Discord fetch — we already have the metadata)
 *   3. The local IndexedDB stays authoritative for the current session; the
 *      server is the persistent backup across devices/browsers.
 */

import { db } from "@/lib/storage/db";
import { getActiveDriveId, setActiveDriveId, clearActiveDriveId } from "@/lib/storage/drives";
import type { Drive } from "@/lib/storage/schema";
import { authFetch } from "@/lib/api-base";
import { isUnlocked } from "@/lib/e2ee-client/keyring";
import { createDriveKeyForNewDrive, getDriveKeyMaterial, migrateDrive, type DriveKeyMaterial } from "@/lib/e2ee-client/drive-keys";

type ServerWebhook = {
  driveId: string;
  webhookUrl: string;
  name: string;
  channelId: string;
  guildId?: string;
  /** E2EE drive key wrapped by the user's Master Key. */
  dkWrapped?: string | null;
  e2eeVersion?: number;
  createdAt: number;
  lastOpenedAt: number;
};

/**
 * Pull webhooks from the server and upsert them into local IndexedDB.
 * Returns the number of webhooks synced.
 */
export async function syncWebhooksFromServer(): Promise<number> {
  const res = await authFetch("/api/webhooks");
  if (!res.ok) return 0;

  const webhooks: ServerWebhook[] = await res.json();

  // The server (Neon, per-account) is authoritative for which webhooks belong
  // to the logged-in user. IndexedDB is only a local cache shared across all
  // accounts on this browser — so we must RECONCILE it to match the server
  // exactly, otherwise a previous account's webhooks leak into this one.
  const serverIds = new Set(webhooks.map((w) => w.driveId));

  // 1) Upsert every server webhook into IndexedDB.
  for (const w of webhooks) {
    const existing = await db().drives.get(w.driveId);
    const row: Drive = {
      id: w.driveId,
      webhookUrl: w.webhookUrl,
      name: existing?.name ?? w.name,
      channelId: w.channelId,
      guildId: w.guildId,
      dkWrapped: w.dkWrapped ?? undefined,
      e2eeVersion: w.e2eeVersion ?? 0,
      createdAt: existing?.createdAt ?? w.createdAt,
      lastOpenedAt: w.lastOpenedAt,
    };
    await db().drives.put(row);
  }

  // 2) Delete any local drive that the current account does NOT own. Never
  // touch the currently active drive: it may have just been added locally
  // and not landed on the server yet (pushWebhookToServer races this sync) —
  // deleting it would silently kick the user back to /setup mid-flow.
  const activeId = getActiveDriveId();
  const localDrives = await db().drives.toArray();
  const staleIds = localDrives
    .map((d) => d.id)
    .filter((id) => !serverIds.has(id) && id !== activeId);
  if (staleIds.length > 0) {
    await db().transaction("rw", [db().drives, db().shares], async () => {
      await db().shares.where("driveId").anyOf(staleIds).delete();
      await db().drives.bulkDelete(staleIds);
    });
    // 3) If the active drive was one of the removed ones, clear the selection.
    const active = getActiveDriveId();
    if (active && staleIds.includes(active)) clearActiveDriveId();
  }

  // Auto-select a drive if none is active, so the user lands straight on their
  // files after signing in (instead of the "add a webhook" screen).
  if (!getActiveDriveId()) {
    const recent = await db().drives.orderBy("lastOpenedAt").reverse().first();
    if (recent) setActiveDriveId(recent.id);
  }

  return webhooks.length;
}

/**
 * Save a newly-added drive to the server.
 * Called after addDriveFromWebhook() succeeds locally.
 *
 * With the keyring unlocked, the drive gets an end-to-end key right away: generated here,
 * wrapped by the Master Key, and only the wrapped blob is sent. (If the keyring is somehow
 * locked, the drive is created keyless and migrated at the next unlock.)
 */
export async function pushWebhookToServer(drive: Drive): Promise<void> {
  const fresh = isUnlocked() && (drive.e2eeVersion ?? 0) < 1 ? await createDriveKeyForNewDrive(drive.id) : null;
  const res = await authFetch("/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driveId: drive.id,
      webhookUrl: drive.webhookUrl,
      name: drive.name,
      channelId: drive.channelId,
      guildId: drive.guildId,
      ...(fresh ? { dkWrapped: fresh.dkWrapped } : {}),
    }),
  });
  if (res.ok && fresh) {
    // The key exists only once the server has confirmed it (losing the only copy = files unreadable).
    await db().drives.update(drive.id, { dkWrapped: fresh.dkWrapped, e2eeVersion: 1 });
  }
}

/**
 * The key that end-to-end encrypts a drive's regular files (format v1), or null when the drive
 * isn't migrated / the keyring is locked — in which case uploads must wait rather than go out in clear.
 */
export async function ensureDriveKey(drive: Drive): Promise<DriveKeyMaterial | null> {
  if (!isUnlocked()) return null;
  let current = (await db().drives.get(drive.id)) ?? drive;
  if ((current.e2eeVersion ?? 0) < 1) current = await migrateDrive(current);
  return getDriveKeyMaterial(current);
}

/**
 * Remove a drive from the server after it's removed locally.
 */
export async function removeWebhookFromServer(driveId: string): Promise<void> {
  await authFetch(`/api/webhooks/${driveId}`, { method: "DELETE" });
}

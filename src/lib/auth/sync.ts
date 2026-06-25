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
import { getActiveDriveId, clearActiveDriveId } from "@/lib/storage/drives";
import type { Drive } from "@/lib/storage/schema";
import { generateDriveKeyB64, importDriveKey } from "@/lib/crypto/drive-crypto";

type ServerWebhook = {
  driveId: string;
  webhookUrl: string;
  name: string;
  channelId: string;
  guildId?: string;
  /** base64 raw per-drive file key (decrypted server-side), or null if unset. */
  encKey?: string | null;
  createdAt: number;
  lastOpenedAt: number;
};

/**
 * Pull webhooks from the server and upsert them into local IndexedDB.
 * Returns the number of webhooks synced.
 */
export async function syncWebhooksFromServer(): Promise<number> {
  const res = await fetch("/api/webhooks");
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
      encKey: w.encKey ?? existing?.encKey,
      createdAt: existing?.createdAt ?? w.createdAt,
      lastOpenedAt: w.lastOpenedAt,
    };
    await db().drives.put(row);
  }

  // 2) Delete any local drive that the current account does NOT own.
  const localDrives = await db().drives.toArray();
  const staleIds = localDrives
    .map((d) => d.id)
    .filter((id) => !serverIds.has(id));
  if (staleIds.length > 0) {
    await db().transaction("rw", [db().drives, db().shares], async () => {
      await db().shares.where("driveId").anyOf(staleIds).delete();
      await db().drives.bulkDelete(staleIds);
    });
    // 3) If the active drive was one of the removed ones, clear the selection.
    const active = getActiveDriveId();
    if (active && staleIds.includes(active)) clearActiveDriveId();
  }

  return webhooks.length;
}

/**
 * Save a newly-added drive to the server.
 * Called after addDriveFromWebhook() succeeds locally.
 */
export async function pushWebhookToServer(drive: Drive): Promise<void> {
  // Ensure the drive has an encryption key, but persist it LOCALLY only after
  // the server confirms storage — so a key never exists unless it's safely
  // backed up on the account (losing the only copy = files unreadable forever).
  const encKey = drive.encKey ?? generateDriveKeyB64();
  const res = await fetch("/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driveId: drive.id,
      webhookUrl: drive.webhookUrl,
      name: drive.name,
      channelId: drive.channelId,
      guildId: drive.guildId,
      encKey,
    }),
  });
  if (res.ok && !drive.encKey) {
    await db().drives.update(drive.id, { encKey });
  }
}

/**
 * Resolve the AES-GCM key that encrypts a drive's regular files.
 *
 * If the drive has no key yet, try to create one (pushWebhookToServer generates
 * + persists it — but only when signed in). Returns null when no key is
 * available (e.g. not signed in), in which case uploads stay unencrypted.
 */
export async function ensureDriveKey(drive: Drive): Promise<CryptoKey | null> {
  let encKey = drive.encKey;
  if (!encKey) {
    await pushWebhookToServer(drive);
    encKey = (await db().drives.get(drive.id))?.encKey;
  }
  return encKey ? importDriveKey(encKey) : null;
}

/**
 * Remove a drive from the server after it's removed locally.
 */
export async function removeWebhookFromServer(driveId: string): Promise<void> {
  await fetch(`/api/webhooks/${driveId}`, { method: "DELETE" });
}

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
import type { Drive } from "@/lib/storage/schema";

type ServerWebhook = {
  driveId: string;
  webhookUrl: string;
  name: string;
  channelId: string;
  guildId?: string;
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
  if (!webhooks.length) return 0;

  for (const w of webhooks) {
    const existing = await db().drives.get(w.driveId);
    const row: Drive = {
      id: w.driveId,
      webhookUrl: w.webhookUrl,
      name: existing?.name ?? w.name,
      channelId: w.channelId,
      guildId: w.guildId,
      createdAt: existing?.createdAt ?? w.createdAt,
      lastOpenedAt: w.lastOpenedAt,
    };
    await db().drives.put(row);
  }

  return webhooks.length;
}

/**
 * Save a newly-added drive to the server.
 * Called after addDriveFromWebhook() succeeds locally.
 */
export async function pushWebhookToServer(drive: Drive): Promise<void> {
  await fetch("/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driveId: drive.id,
      webhookUrl: drive.webhookUrl,
      name: drive.name,
      channelId: drive.channelId,
      guildId: drive.guildId,
    }),
  });
}

/**
 * Remove a drive from the server after it's removed locally.
 */
export async function removeWebhookFromServer(driveId: string): Promise<void> {
  await fetch(`/api/webhooks/${driveId}`, { method: "DELETE" });
}

import { hashWebhook, parseWebhookUrl, fetchWebhookInfo } from "@/lib/discord";
import { db } from "./db";
import type { Drive } from "./schema";

/** Where we remember which drive the user last opened. */
const ACTIVE_DRIVE_KEY = "discloud:activeDriveId";

/** Custom event fired in-tab whenever the active drive id changes.
 *  The browser's `storage` event only fires for OTHER tabs, so we use this
 *  alongside it to keep hooks in sync within the same tab. */
const ACTIVE_DRIVE_EVENT = "discloud:active-drive-changed";

export const ACTIVE_DRIVE_EVENT_NAME = ACTIVE_DRIVE_EVENT;

/**
 * Add a drive from a raw webhook URL.
 *
 * Validates the URL syntactically, hashes it for the stable drive id, fetches
 * the webhook info from Discord (server-side name + channel), upserts the
 * Drive row, and returns it. Idempotent — calling this with the same webhook
 * URL twice just refreshes the row.
 */
export async function addDriveFromWebhook(webhookUrl: string): Promise<Drive> {
  const ref = parseWebhookUrl(webhookUrl);
  if (!ref) throw new Error("URL de webhook Discord invalide");
  const [id, info] = await Promise.all([
    hashWebhook(ref),
    fetchWebhookInfo(ref),
  ]);

  const now = Date.now();
  const existing = await db().drives.get(id);
  const row: Drive = {
    id,
    webhookUrl: ref.url,
    name: existing?.name || info.name || "Mon drive",
    channelId: info.channel_id,
    guildId: info.guild_id,
    createdAt: existing?.createdAt ?? now,
    lastOpenedAt: now,
  };
  await db().drives.put(row);
  setActiveDriveId(id);
  return row;
}

export async function listDrives(): Promise<Drive[]> {
  return db().drives.orderBy("lastOpenedAt").reverse().toArray();
}

export async function getDrive(id: string): Promise<Drive | undefined> {
  return db().drives.get(id);
}

export async function renameDrive(id: string, name: string): Promise<void> {
  await db().drives.update(id, { name });
}

/**
 * Hard-delete a drive AND every folder/file/share metadata associated with it.
 * Does NOT touch Discord — chunks already uploaded remain in the channel.
 * Use this when the user "unlinks" a drive but wants to keep the Discord
 * data accessible elsewhere.
 */
export async function removeDriveMetadata(id: string): Promise<void> {
  await db().transaction(
    "rw",
    [db().drives, db().folders, db().files, db().shares],
    async () => {
      await db().folders.where("driveId").equals(id).delete();
      await db().files.where("driveId").equals(id).delete();
      await db().shares.where("driveId").equals(id).delete();
      await db().drives.delete(id);
    },
  );
  if (getActiveDriveId() === id) clearActiveDriveId();
}

// --- Active drive (current selection) ---

export function getActiveDriveId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_DRIVE_KEY);
}

export function setActiveDriveId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_DRIVE_KEY, id);
  window.dispatchEvent(
    new CustomEvent<string | null>(ACTIVE_DRIVE_EVENT, { detail: id }),
  );
}

export function clearActiveDriveId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_DRIVE_KEY);
  window.dispatchEvent(
    new CustomEvent<string | null>(ACTIVE_DRIVE_EVENT, { detail: null }),
  );
}

export async function touchActiveDrive(id: string): Promise<void> {
  await db().drives.update(id, { lastOpenedAt: Date.now() });
  setActiveDriveId(id);
}

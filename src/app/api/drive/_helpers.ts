/**
 * Shared helpers for /api/drive/[driveId] route handlers.
 */
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Webhook } from "@/generated/prisma/client";
import type { FileEntry, FolderEntry } from "@/lib/storage/schema";
import type { ChunkRef } from "@/lib/discord";

// ── Auth helper ────────────────────────────────────────────────────────────────

/** Verify session + webhook ownership. Returns null → respond 401/404. */
export async function getAuthorizedWebhook(
  driveId: string,
): Promise<{ webhook: Webhook; userId: string } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const webhook = await prisma.webhook.findFirst({
    where: { driveId, userId: session.user.id },
  });
  if (!webhook) return null;
  return { webhook, userId: session.user.id };
}

// ── Serialization helpers ──────────────────────────────────────────────────────

type PrismaFile = {
  id: string; webhookId: string; driveId: string; parentId: string;
  filename: string; size: number; mimeType: string; chunkSize: number;
  chunks: unknown; tags: string[]; favorite: boolean; locked: boolean;
  encIv: string | null;
  trashed: boolean; trashedAt: Date | null;
  createdAt: Date; updatedAt: Date;
};

type PrismaFolder = {
  id: string; webhookId: string; driveId: string; parentId: string;
  name: string; color: string | null; trashed: boolean; trashedAt: Date | null;
  createdAt: Date; updatedAt: Date;
};

export function toFileEntry(row: PrismaFile): FileEntry {
  return {
    id: row.id,
    driveId: row.driveId,
    parentId: row.parentId,
    filename: row.filename,
    size: row.size,
    mimeType: row.mimeType,
    chunkSize: row.chunkSize,
    chunks: row.chunks as ChunkRef[],
    tags: row.tags,
    favorite: row.favorite,
    locked: row.locked,
    encIv: row.encIv ?? undefined,
    trashed: row.trashed,
    trashedAt: row.trashedAt?.getTime(),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export function toFolderEntry(row: PrismaFolder): FolderEntry {
  return {
    id: row.id,
    driveId: row.driveId,
    parentId: row.parentId,
    name: row.name,
    color: row.color ?? undefined,
    trashed: row.trashed,
    trashedAt: row.trashedAt?.getTime(),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

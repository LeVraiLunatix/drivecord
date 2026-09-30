/**
 * Database-backed helpers shared by the `/api/v2` drive routes. Every query
 * here is scoped by `webhookId` (= the key's drive) and every file query also
 * excludes `locked` (vault) items: the vault is zero-knowledge and must never
 * be reachable through an API key.
 */
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { DiscordClient } from "@/lib/discord";
import type { ChunkRef, FileManifest } from "@/lib/discord";
import type { Webhook } from "@/generated/prisma/client";
import { ApiError, conflict } from "./errors.ts";
import type { FolderNode } from "./tree.ts";

/** `(id, parentId)` of every folder in the drive, trashed ones included. */
export async function loadFolderNodes(webhookId: string): Promise<FolderNode[]> {
  return prisma.driveFolder.findMany({ where: { webhookId }, select: { id: true, parentId: true } });
}

/** Destination folder must exist in this drive and not be in the trash. `""` = root. */
export async function assertParentUsable(webhookId: string, parentId: string): Promise<void> {
  if (parentId === "") return;
  const parent = await prisma.driveFolder.findFirst({
    where: { id: parentId, webhookId },
    select: { trashed: true },
  });
  if (!parent) throw new ApiError(404, "parent_not_found", "Dossier de destination introuvable.");
  if (parent.trashed) throw conflict("parent_trashed", "Le dossier de destination est dans la corbeille.");
}

const CLEANUP_CONCURRENCY = 4;

/**
 * Delete the Discord messages of every file. All-or-nothing from the caller's
 * point of view: returns the names that failed so the route can refuse to drop
 * the metadata of a file whose messages are still live (they'd be orphaned).
 */
export async function deleteFromDiscord(
  webhook: Webhook,
  files: { filename: string; size: number; mimeType: string; chunkSize: number; chunks: unknown }[],
): Promise<string[]> {
  if (files.length === 0) return [];
  const client = DiscordClient.fromUrl(decryptUrl(webhook.encryptedUrl));
  const failures: string[] = [];
  for (let i = 0; i < files.length; i += CLEANUP_CONCURRENCY) {
    await Promise.all(
      files.slice(i, i + CLEANUP_CONCURRENCY).map(async (f) => {
        const manifest: FileManifest = {
          size: f.size,
          mimeType: f.mimeType,
          filename: f.filename,
          chunkSize: f.chunkSize,
          chunks: f.chunks as ChunkRef[],
        };
        try {
          await client.deleteFile(manifest);
        } catch {
          failures.push(f.filename);
        }
      }),
    );
  }
  return failures;
}

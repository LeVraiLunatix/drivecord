import { decryptUrl } from "@/lib/auth/encrypt";
import { DiscordClient } from "@/lib/discord";
import type { ChunkRef, FileManifest } from "@/lib/discord";
import type { Webhook } from "@/generated/prisma/client";

const CONCURRENCY = 4;

/**
 * Delete the Discord messages of each file. Returns the names that failed so a
 * route can refuse to drop the metadata of a file whose messages are still live
 * (they would be orphaned with nothing left to ever clean them up).
 */
export async function deleteFileMessages(
  webhook: Webhook,
  files: { filename: string; size: number; mimeType: string; chunkSize: number; chunks: unknown }[],
): Promise<string[]> {
  if (files.length === 0) return [];
  const client = DiscordClient.fromUrl(decryptUrl(webhook.encryptedUrl));
  const failures: string[] = [];
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    await Promise.all(
      files.slice(i, i + CONCURRENCY).map(async (f) => {
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

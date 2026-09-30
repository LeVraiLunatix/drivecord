/**
 * Database side of chunked API uploads (rules live in `upload-session-core.ts`).
 */
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { DiscordClient } from "@/lib/discord";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_OPEN_SESSIONS_PER_KEY, SESSION_TTL_MS, UploadError } from "./upload-session-core";

export async function createSession(input: {
  apiKeyId: string;
  userId: string;
  webhookId: string;
  parentId?: string;
  expectedChunks?: number | null;
}) {
  const now = new Date();
  const open = await prisma.uploadSession.count({
    where: { apiKeyId: input.apiKeyId, status: "open", expiresAt: { gt: now } },
  });
  if (open >= MAX_OPEN_SESSIONS_PER_KEY) {
    throw new UploadError(429, `Trop d'uploads en cours pour cette clé (max ${MAX_OPEN_SESSIONS_PER_KEY}). Termine ou annule les autres d'abord.`);
  }
  return prisma.uploadSession.create({
    data: {
      apiKeyId: input.apiKeyId,
      userId: input.userId,
      webhookId: input.webhookId,
      parentId: input.parentId ?? "",
      expectedChunks: input.expectedChunks ?? null,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  });
}

/**
 * Lazy cleanup: abort sessions that expired while still open and delete their
 * Discord messages (best-effort). Rate-gated so it costs almost nothing.
 */
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    const gate = await rateLimit("upload-sessions:cleanup", 1, 300);
    if (!gate.ok) return;
    const stale = await prisma.uploadSession.findMany({
      where: { status: "open", expiresAt: { lte: new Date() } },
      include: { chunks: true, webhook: { select: { encryptedUrl: true } } },
      take: 20,
    });
    for (const s of stale) {
      // Claim it first so two workers don't both clean the same session.
      const { count } = await prisma.uploadSession.updateMany({
        where: { id: s.id, status: "open" },
        data: { status: "aborted" },
      });
      if (count !== 1) continue;
      await deleteSessionMessages(s.webhook.encryptedUrl, s.chunks);
      await prisma.uploadChunk.deleteMany({ where: { sessionId: s.id } });
    }
    // Finished sessions carry no more information than the file row does.
    await prisma.uploadSession.deleteMany({
      where: { status: { in: ["completed", "aborted"] }, createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
    });
  } catch (err) {
    console.warn("[upload-sessions] cleanup failed", err instanceof Error ? err.message : err);
  }
}

/** Best-effort deletion of the Discord messages of uploaded chunks. */
export async function deleteSessionMessages(
  encryptedWebhookUrl: string,
  chunks: { index: number; size: number; messageId: string; attachmentId: string; url: string }[],
): Promise<void> {
  if (chunks.length === 0) return;
  const client = DiscordClient.fromUrl(decryptUrl(encryptedWebhookUrl));
  for (const c of chunks) {
    await client
      .deleteChunk({ index: c.index, size: c.size, messageId: c.messageId, attachmentId: c.attachmentId, url: c.url, expiresAt: 0 })
      .catch(() => {});
  }
}

/** DELETE /api/v2/uploads/[uploadId] — abort and clean up the Discord messages already relayed. */
import { prisma } from "@/lib/prisma";
import { BUCKETS, noContent, preflight, v2Route } from "@/lib/api-v2/http";
import { loadScope } from "@/lib/api-v2/drive";
import { ownedSession } from "@/lib/api-v2/uploads";
import { deleteSessionMessages } from "@/lib/upload-sessions";

export const runtime = "nodejs";
export const OPTIONS = preflight("DELETE, OPTIONS");

export const DELETE = v2Route<{ uploadId: string }>({ cap: "write", bucket: BUCKETS.write, route: "/api/v2/uploads/[uploadId]" }, async ({ principal, params }) => {
  const s = await ownedSession(principal, params.uploadId);
  const scope = await loadScope(principal);
  const { count } = await prisma.uploadSession.updateMany({ where: { id: s.id, status: "open" }, data: { status: "aborted" } });
  if (count === 1) {
    const chunks = await prisma.uploadChunk.findMany({ where: { sessionId: s.id } });
    await deleteSessionMessages(scope.webhook.encryptedUrl, chunks);
    await prisma.uploadChunk.deleteMany({ where: { sessionId: s.id } });
  }
  return noContent();
});

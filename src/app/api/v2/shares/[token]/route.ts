/** GET / DELETE /api/v2/shares/[token] — inspect or revoke a share of this drive (personal tokens only). */
import { prisma } from "@/lib/prisma";
import { BUCKETS, noContent, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { loadScope } from "@/lib/api-v2/drive";

export const runtime = "nodejs";
export const OPTIONS = preflight("GET, DELETE, OPTIONS");
type P = { token: string };

async function find(webhookId: string, token: string) {
  const s = /^[A-Za-z0-9_-]{8,64}$/.test(token) ? await prisma.share.findFirst({ where: { token, webhookId } }) : null;
  if (!s) throw new ApiError(404, "share_not_found", "Partage introuvable.");
  return s;
}

export const GET = v2Route<P>({ cap: "share", bucket: BUCKETS.share, route: "/api/v2/shares/[token]" }, async ({ principal, params }) => {
  const s = await find((await loadScope(principal)).webhook.id, params.token);
  return ok({ token: s.token, fileId: s.fileId, hasPassword: Boolean(s.fkWrappedForShare), expiresAt: s.expiresAt?.toISOString() ?? null, downloads: s.downloads, disabled: Boolean(s.disabledAt), createdAt: s.createdAt.toISOString() });
});

export const DELETE = v2Route<P>({ cap: "share", bucket: BUCKETS.share, route: "/api/v2/shares/[token]" }, async ({ principal, params }) => {
  const scope = await loadScope(principal);
  const s = await find(scope.webhook.id, params.token);
  await prisma.share.delete({ where: { token: s.token } });
  return noContent();
});

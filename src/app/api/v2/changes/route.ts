/** GET /api/v2/changes?cursor= — change journal of the whole drive, for sync clients (personal tokens only). */
import { prisma } from "@/lib/prisma";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { loadScope } from "@/lib/api-v2/drive";
import { parseLimit } from "@/lib/api-v2/validate";

export const runtime = "nodejs";
export const OPTIONS = preflight("GET, OPTIONS");

export const GET = v2Route({ cap: "read", bucket: BUCKETS.read, route: "/api/v2/changes" }, async ({ req, principal }) => {
  // The journal spans the whole drive: an app, confined to its folder, must not see it.
  if (principal.kind !== "pat") throw new ApiError(403, "insufficient_scope", "Le journal des changements est réservé aux jetons personnels.");
  const q = req.nextUrl.searchParams;
  const raw = q.get("cursor") ?? "0";
  if (!/^\d{1,18}$/.test(raw)) throw new ApiError(400, "invalid_cursor", "Curseur invalide.");
  const limit = parseLimit(q.get("limit"), 200, 500);
  const scope = await loadScope(principal);
  const rows = await prisma.changeLog.findMany({ where: { webhookId: scope.webhook.id, id: { gt: BigInt(raw) } }, orderBy: { id: "asc" }, take: limit + 1 });
  const page = rows.slice(0, limit);
  const cursor = page.length ? String(page[page.length - 1]!.id) : raw;
  return ok({
    changes: page.map((c) => ({ type: c.type, kind: c.kind, id: c.itemId, at: c.at.toISOString() })),
    cursor,
    hasMore: rows.length > limit,
  });
});

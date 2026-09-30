/** GET /api/v2/files — list files (cursor pagination, newest first). Names are encrypted: no server-side search. */
import { prisma } from "@/lib/prisma";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { assertFolderAllowed, loadScope, serializeFile } from "@/lib/api-v2/drive";
import { decodeCursor, encodeCursor, keysetWhere, orderBy, sliceWithCursor } from "@/lib/api-v2/pagination";
import { parseBoolParam, parseLimit, parseParentId } from "@/lib/api-v2/validate";

export const runtime = "nodejs";
export const OPTIONS = preflight("GET, OPTIONS");

export const GET = v2Route({ cap: "read", bucket: BUCKETS.read, route: "/api/v2/files" }, async ({ req, principal }) => {
  const q = req.nextUrl.searchParams;
  const scope = await loadScope(principal);
  const limit = parseLimit(q.get("limit"), 50, 200);
  const trashed = parseBoolParam(q.get("trashed"), "trashed") ?? false;
  const rawParent = q.get("parentId");
  // Apps are always inside their folder; a personal token without `parentId` lists the whole drive.
  const parentId = rawParent !== null ? parseParentId(rawParent) : scope.appFolderId ?? undefined;
  if (parentId !== undefined && parentId !== "") assertFolderAllowed(scope, parentId);
  if (parentId === "" && scope.allowed) assertFolderAllowed(scope, "__root__");

  const cursorRaw = q.get("cursor");
  const cursor = cursorRaw ? decodeCursor(cursorRaw, "createdAt", "desc") : null;
  const rows = await prisma.driveFile.findMany({
    where: {
      webhookId: scope.webhook.id,
      locked: false,
      trashed,
      ...(parentId !== undefined ? { parentId } : {}),
      ...(cursor ? keysetWhere("createdAt", "desc", cursor) : {}),
    },
    orderBy: orderBy("createdAt", "desc"),
    take: limit + 1,
  });
  const { page, nextCursor } = sliceWithCursor(rows, limit, (r) => encodeCursor("createdAt", "desc", r.createdAt, r.id));
  return ok({ files: page.map(serializeFile), nextCursor });
});

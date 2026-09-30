/** GET / POST /api/v2/folders — names are sealed by the client (`encName`); the server only stores them. */
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { assertFolderAllowed, assertParentUsable, loadScope, recordChange, resolveParent, serializeFolder, zparse } from "@/lib/api-v2/drive";
import { decodeCursor, encodeCursor, keysetWhere, orderBy, sliceWithCursor } from "@/lib/api-v2/pagination";
import { FOLDER_COLORS, parseBoolParam, parseLimit, parseParentId } from "@/lib/api-v2/validate";
import { idLike, wrappedBlob } from "@/lib/e2ee-server";
import { depthOf, MAX_FOLDER_DEPTH } from "@/lib/api-v2/tree";

export const runtime = "nodejs";
export const OPTIONS = preflight("GET, POST, OPTIONS");

export const GET = v2Route({ cap: "read", bucket: BUCKETS.read, route: "/api/v2/folders" }, async ({ req, principal }) => {
  const q = req.nextUrl.searchParams;
  const scope = await loadScope(principal);
  const limit = parseLimit(q.get("limit"), 50, 200);
  const trashed = parseBoolParam(q.get("trashed"), "trashed") ?? false;
  const rawParent = q.get("parentId");
  const parentId = rawParent !== null ? parseParentId(rawParent) : scope.appFolderId ?? undefined;
  if (parentId !== undefined) {
    if (parentId === "" && scope.allowed) assertFolderAllowed(scope, "__root__");
    if (parentId !== "") assertFolderAllowed(scope, parentId);
  }
  const cursorRaw = q.get("cursor");
  const cursor = cursorRaw ? decodeCursor(cursorRaw, "createdAt", "asc") : null;
  const rows = await prisma.driveFolder.findMany({
    where: { webhookId: scope.webhook.id, trashed, ...(parentId !== undefined ? { parentId } : {}), ...(cursor ? keysetWhere("createdAt", "asc", cursor) : {}) },
    orderBy: orderBy("createdAt", "asc"),
    take: limit + 1,
  });
  const { page, nextCursor } = sliceWithCursor(rows, limit, (r) => encodeCursor("createdAt", "asc", r.createdAt, r.id));
  return ok({ folders: page.map(serializeFolder), nextCursor });
});

const create = z.strictObject({
  parentId: z.union([z.literal(""), idLike]).optional(),
  encName: wrappedBlob,
  color: z.enum(FOLDER_COLORS).nullish(),
});

export const POST = v2Route({ cap: "write", bucket: BUCKETS.write, route: "/api/v2/folders", json: true, idempotent: true }, async ({ principal, body }) => {
  const b = zparse(create, body);
  const scope = await loadScope(principal);
  if (scope.webhook.e2eeVersion < 1) throw new ApiError(409, "unsupported_operation", "Ce drive n'est pas encore chiffré de bout en bout.");
  const parentId = resolveParent(scope, b.parentId);
  await assertParentUsable(scope, parentId);
  const all = await prisma.driveFolder.findMany({ where: { webhookId: scope.webhook.id }, select: { id: true, parentId: true } });
  if (parentId !== "" && depthOf(all, parentId) + 1 > MAX_FOLDER_DEPTH) throw new ApiError(400, "invalid_request", `Profondeur maximale atteinte (${MAX_FOLDER_DEPTH}).`);
  const folder = await prisma.driveFolder.create({
    data: { id: nanoid(21), webhookId: scope.webhook.id, driveId: scope.webhook.driveId, parentId, name: "", encName: b.encName, color: b.color ?? null },
  });
  await recordChange(scope.webhook.id, "upsert", "folder", folder.id);
  return ok(serializeFolder(folder), 201);
});

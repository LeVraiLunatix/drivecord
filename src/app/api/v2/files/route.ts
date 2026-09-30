/**
 * GET /api/v2/files — list files (scope `read`).
 *
 *   parentId=<id|"">   one folder (default: drive root)
 *   recursive=true     the whole drive, ignoring parentId
 *   trashed=false|only|all   (default false)
 *   q=<text>           filename contains (case-insensitive)
 *   mimeType=image/    mime prefix, or a full type
 *   tag=<tag>  favorite=true|false  updatedSince=<ms>
 *   sort=name|createdAt|updatedAt  order=asc|desc  limit=1..200  cursor=<opaque>
 *
 * → { files: [...], nextCursor: string | null }
 *
 * Uploads are not part of v2 yet; keep using `POST /api/v1/files`.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { BUCKETS, ok, v2Route } from "@/lib/api-v2/http";
import {
  decodeCursor,
  encodeCursor,
  keysetWhere,
  orderBy,
  sliceWithCursor,
  type SortField,
  type SortOrder,
} from "@/lib/api-v2/pagination";
import { serializeFile } from "@/lib/api-v2/serialize";
import {
  MAX_TAG_LENGTH,
  parseBoolParam,
  parseEnumParam,
  parseLimit,
  parseMimePrefix,
  parseParentId,
  parseSearch,
  parseTimestampParam,
} from "@/lib/api-v2/validate";
import { badRequest } from "@/lib/api-v2/errors";

export const runtime = "nodejs";

const SORTS = ["name", "createdAt", "updatedAt"] as const satisfies readonly SortField[];
const ORDERS = ["asc", "desc"] as const satisfies readonly SortOrder[];
const TRASHED = ["false", "only", "all"] as const;

export const GET = v2Route({ scope: "read", bucket: BUCKETS.read }, async ({ req, auth }) => {
  const sp = req.nextUrl.searchParams;

  const sort = parseEnumParam(sp.get("sort"), "sort", SORTS, "name");
  const order = parseEnumParam(sp.get("order"), "order", ORDERS, "asc");
  const trashed = parseEnumParam(sp.get("trashed"), "trashed", TRASHED, "false");
  const limit = parseLimit(sp.get("limit"), 50, 200);
  const recursive = parseBoolParam(sp.get("recursive"), "recursive") ?? false;
  const parentParam = sp.get("parentId");
  const q = parseSearch(sp.get("q"));
  const mimeType = parseMimePrefix(sp.get("mimeType"));
  const favorite = parseBoolParam(sp.get("favorite"), "favorite");
  const updatedSince = parseTimestampParam(sp.get("updatedSince"), "updatedSince");
  const tag = sp.get("tag");
  if (tag !== null && (tag.length === 0 || tag.length > MAX_TAG_LENGTH)) {
    throw badRequest("`tag` invalide.");
  }
  const cursorRaw = sp.get("cursor");
  const field = sort === "name" ? "filename" : sort;

  // Folder scope: explicit parentId wins; otherwise the root — except for
  // recursive listings and trash views, which span the whole drive (a trashed
  // file keeps its original parentId, so "root only" would hide most of it).
  const scoped = parentParam !== null || (!recursive && trashed === "false");
  const parentId = scoped ? parseParentId(parentParam ?? "") : undefined;

  const and: Prisma.DriveFileWhereInput[] = [];
  if (cursorRaw !== null) {
    and.push(keysetWhere(field, order, decodeCursor(cursorRaw, sort, order)) as Prisma.DriveFileWhereInput);
  }

  const rows = await prisma.driveFile.findMany({
    where: {
      webhookId: auth.webhook.id,
      locked: false,
      ...(parentId !== undefined ? { parentId } : {}),
      ...(trashed === "false" ? { trashed: false } : trashed === "only" ? { trashed: true } : {}),
      ...(q ? { filename: { contains: q, mode: "insensitive" as const } } : {}),
      ...(mimeType ? { mimeType: { startsWith: mimeType, mode: "insensitive" as const } } : {}),
      ...(tag !== null ? { tags: { has: tag } } : {}),
      ...(favorite !== undefined ? { favorite } : {}),
      ...(updatedSince ? { updatedAt: { gt: updatedSince } } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    },
    orderBy: orderBy(field, order) as Prisma.DriveFileOrderByWithRelationInput[],
    take: limit + 1,
  });

  const { page, nextCursor } = sliceWithCursor(rows, limit, (r) =>
    encodeCursor(sort, order, sort === "name" ? r.filename : r[sort], r.id),
  );
  return ok({ files: page.map(serializeFile), nextCursor });
});

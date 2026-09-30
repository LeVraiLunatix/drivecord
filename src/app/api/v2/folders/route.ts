/**
 * GET  /api/v2/folders — list folders (scope `read`)
 *   parentId=<id|"">  one level (default: root)   recursive=true  whole drive
 *   trashed=false|only|all   sort=name|createdAt|updatedAt  order  limit=1..500  cursor
 *   → { folders: [...], nextCursor }
 * POST /api/v2/folders — { name, parentId?, color? } → 201   (scope `write`)
 */
import { nanoid } from "nanoid";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { BUCKETS, ok, readJsonBody, v2Route } from "@/lib/api-v2/http";
import {
  decodeCursor,
  encodeCursor,
  keysetWhere,
  orderBy,
  sliceWithCursor,
  type SortField,
  type SortOrder,
} from "@/lib/api-v2/pagination";
import { serializeFolder } from "@/lib/api-v2/serialize";
import { assertParentUsable, loadFolderNodes } from "@/lib/api-v2/drive";
import { ApiError } from "@/lib/api-v2/errors";
import { depthOf, MAX_FOLDER_DEPTH } from "@/lib/api-v2/tree";
import {
  assertKnownKeys,
  parseBoolParam,
  parseColor,
  parseEnumParam,
  parseLimit,
  parseName,
  parseParentId,
} from "@/lib/api-v2/validate";

export const runtime = "nodejs";

const SORTS = ["name", "createdAt", "updatedAt"] as const satisfies readonly SortField[];
const ORDERS = ["asc", "desc"] as const satisfies readonly SortOrder[];
const TRASHED = ["false", "only", "all"] as const;

export const GET = v2Route({ scope: "read", bucket: BUCKETS.read }, async ({ req, auth }) => {
  const sp = req.nextUrl.searchParams;
  const sort = parseEnumParam(sp.get("sort"), "sort", SORTS, "name");
  const order = parseEnumParam(sp.get("order"), "order", ORDERS, "asc");
  const trashed = parseEnumParam(sp.get("trashed"), "trashed", TRASHED, "false");
  const limit = parseLimit(sp.get("limit"), 100, 500);
  const recursive = parseBoolParam(sp.get("recursive"), "recursive") ?? false;
  const parentParam = sp.get("parentId");
  const cursorRaw = sp.get("cursor");

  const scoped = parentParam !== null || (!recursive && trashed === "false");
  const parentId = scoped ? parseParentId(parentParam ?? "") : undefined;

  const rows = await prisma.driveFolder.findMany({
    where: {
      webhookId: auth.webhook.id,
      ...(parentId !== undefined ? { parentId } : {}),
      ...(trashed === "false" ? { trashed: false } : trashed === "only" ? { trashed: true } : {}),
      ...(cursorRaw !== null
        ? { AND: [keysetWhere(sort, order, decodeCursor(cursorRaw, sort, order)) as Prisma.DriveFolderWhereInput] }
        : {}),
    },
    orderBy: orderBy(sort, order) as Prisma.DriveFolderOrderByWithRelationInput[],
    take: limit + 1,
  });

  const { page, nextCursor } = sliceWithCursor(rows, limit, (r) =>
    encodeCursor(sort, order, sort === "name" ? r.name : r[sort], r.id),
  );
  return ok({ folders: page.map(serializeFolder), nextCursor });
});

export const POST = v2Route({ scope: "write", bucket: BUCKETS.write }, async ({ req, auth }) => {
  const body = await readJsonBody(req);
  assertKnownKeys(body, ["name", "parentId", "color"]);

  const name = parseName(body.name);
  const parentId = "parentId" in body ? parseParentId(body.parentId) : "";
  const color = "color" in body ? parseColor(body.color) : null;

  await assertParentUsable(auth.webhook.id, parentId);
  const depth = depthOf(await loadFolderNodes(auth.webhook.id), parentId) + 1;
  if (depth > MAX_FOLDER_DEPTH) {
    throw new ApiError(400, "max_depth", `Profondeur maximale dépassée (${MAX_FOLDER_DEPTH} niveaux).`);
  }

  const row = await prisma.driveFolder.create({
    data: { id: nanoid(12), webhookId: auth.webhook.id, driveId: auth.webhook.driveId, parentId, name, color },
  });
  return ok(serializeFolder(row), { status: 201 });
});

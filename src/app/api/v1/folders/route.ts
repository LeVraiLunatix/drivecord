/**
 * GET  /api/v1/folders — list folders in the drive
 *   ?parentId=<id>  direct children of that folder (default: root, "")
 *   ?recursive=1    every non-trashed folder in the drive (build the tree client-side)
 * POST /api/v1/folders — create a folder. Body: { name, parentId? } → 201 FolderEntry
 *
 * Folders are pure metadata — Discord has no folder concept.
 */
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { toFolderEntry } from "@/app/api/drive/_helpers";
import { assertParentUsable } from "@/lib/api-v1/guards";
import { folderCreateSchema, parentIdSchema, parse, readJson } from "@/lib/api-v1/schemas";
import { json, preflight, v1Route } from "@/lib/api-v1/pipeline";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

export const GET = v1Route({ route: "/api/v1/folders", scope: "files:read" }, async ({ req, auth }) => {
  const sp = req.nextUrl.searchParams;
  const recursive = sp.get("recursive") === "1";
  const parentId = recursive ? undefined : parse(parentIdSchema, sp.get("parentId") ?? "");

  const rows = await prisma.driveFolder.findMany({
    where: { webhookId: auth.webhook.id, trashed: false, ...(parentId !== undefined ? { parentId } : {}) },
    orderBy: { name: "asc" },
    take: 5000,
  });
  return json({ folders: rows.map(toFolderEntry) });
});

export const POST = v1Route({ route: "/api/v1/folders", scope: "folders:write" }, async ({ req, auth }) => {
  const body = await readJson(req, folderCreateSchema);
  const parentId = body.parentId ?? "";
  await assertParentUsable(auth.webhook.id, parentId);

  const row = await prisma.driveFolder.create({
    data: { id: nanoid(12), webhookId: auth.webhook.id, driveId: auth.webhook.driveId, parentId, name: body.name },
  });
  return json(toFolderEntry(row), { status: 201 });
});

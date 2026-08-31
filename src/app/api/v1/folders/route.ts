/**
 * GET  /api/v1/folders — list folders in the drive
 *   ?parentId=<id>  direct children of that folder (default: root, "")
 *   ?recursive=1    every non-trashed folder in the drive (build the tree client-side)
 * POST /api/v1/folders — create a folder. Body: { name, parentId? } → 201 FolderEntry
 *
 * Auth: `Authorization: Bearer dvc_...`. Folders are pure metadata — Discord has
 * no folder concept — so creating one never touches Discord.
 */
import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { toFolderEntry } from "@/app/api/drive/_helpers";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight } from "../_helpers";

export const runtime = "nodejs";

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "read")) {
    return corsJson({ error: "Cette clé n'a pas la permission de lecture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const recursive = searchParams.get("recursive") === "1";

  const rows = await prisma.driveFolder.findMany({
    where: {
      webhookId: auth.webhook.id,
      trashed: false,
      ...(recursive ? {} : { parentId: searchParams.get("parentId") ?? "" }),
    },
    orderBy: { name: "asc" },
  });

  return corsJson({ folders: rows.map(toFolderEntry) });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "write")) {
    return corsJson({ error: "Cette clé n'a pas la permission d'écriture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    parentId?: string;
  } | null;

  const name = body?.name?.trim();
  if (!name) {
    return corsJson({ error: "Le champ `name` est requis." }, { status: 400 });
  }

  const parentId = body?.parentId?.trim() || "";
  if (parentId) {
    const parent = await prisma.driveFolder.findFirst({
      where: { id: parentId, webhookId: auth.webhook.id, trashed: false },
      select: { id: true },
    });
    if (!parent) {
      return corsJson({ error: "Dossier parent introuvable." }, { status: 404 });
    }
  }

  const row = await prisma.driveFolder.create({
    data: {
      id: nanoid(12),
      webhookId: auth.webhook.id,
      driveId: auth.webhook.driveId,
      parentId,
      name,
    },
  });

  return corsJson(toFolderEntry(row), { status: 201 });
}

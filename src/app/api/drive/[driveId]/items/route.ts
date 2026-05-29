/**
 * GET /api/drive/[driveId]/items
 *
 * Query params:
 *  - parentId  (string, default "") — list items inside this folder
 *  - view      ("favorites" | "trash") — special views
 *  - tag       (string) — files with this tag
 *  - search    (string) — filename substring search
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook, toFileEntry, toFolderEntry } from "../../_helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { webhook } = result;

  const sp = req.nextUrl.searchParams;
  const view = sp.get("view");
  const tag = sp.get("tag");
  const search = sp.get("search");
  const parentId = sp.get("parentId") ?? "";

  // ── Favorites ─────────────────────────────────────────────────────────────
  if (view === "favorites") {
    const files = await prisma.driveFile.findMany({
      where: { webhookId: webhook.id, favorite: true, trashed: false },
      orderBy: { filename: "asc" },
    });
    return NextResponse.json({ items: files.map((f) => ({ kind: "file", ...toFileEntry(f) })) });
  }

  // ── Trash ──────────────────────────────────────────────────────────────────
  if (view === "trash") {
    const [files, folders] = await Promise.all([
      prisma.driveFile.findMany({
        where: { webhookId: webhook.id, trashed: true },
        orderBy: { trashedAt: "desc" },
      }),
      prisma.driveFolder.findMany({
        where: { webhookId: webhook.id, trashed: true },
        orderBy: { trashedAt: "desc" },
      }),
    ]);
    const items = [
      ...folders.map((f) => ({ kind: "folder" as const, ...toFolderEntry(f) })),
      ...files.map((f) => ({ kind: "file" as const, ...toFileEntry(f) })),
    ].sort((a, b) => (b.trashedAt ?? b.updatedAt) - (a.trashedAt ?? a.updatedAt));
    return NextResponse.json({ items });
  }

  // ── Tag filter ─────────────────────────────────────────────────────────────
  if (tag) {
    const files = await prisma.driveFile.findMany({
      where: { webhookId: webhook.id, tags: { has: tag }, trashed: false },
      orderBy: { filename: "asc" },
    });
    return NextResponse.json({ items: files.map((f) => ({ kind: "file", ...toFileEntry(f) })) });
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  if (search) {
    const q = search.toLowerCase();
    const [files, folders] = await Promise.all([
      prisma.driveFile.findMany({
        where: {
          webhookId: webhook.id, trashed: false,
          filename: { contains: q, mode: "insensitive" },
        },
        orderBy: { filename: "asc" },
        take: 200,
      }),
      prisma.driveFolder.findMany({
        where: {
          webhookId: webhook.id, trashed: false,
          name: { contains: q, mode: "insensitive" },
        },
        orderBy: { name: "asc" },
        take: 200,
      }),
    ]);
    const items = [
      ...folders.map((f) => ({ kind: "folder" as const, ...toFolderEntry(f) })),
      ...files.map((f) => ({ kind: "file" as const, ...toFileEntry(f) })),
    ];
    return NextResponse.json({ items });
  }

  // ── Normal folder listing ──────────────────────────────────────────────────
  const [folders, files] = await Promise.all([
    prisma.driveFolder.findMany({
      where: { webhookId: webhook.id, parentId, trashed: false },
      orderBy: { name: "asc" },
    }),
    prisma.driveFile.findMany({
      where: { webhookId: webhook.id, parentId, trashed: false },
      orderBy: { filename: "asc" },
    }),
  ]);

  const items = [
    ...folders.map((f) => ({ kind: "folder" as const, ...toFolderEntry(f) })),
    ...files.map((f) => ({ kind: "file" as const, ...toFileEntry(f) })),
  ];
  return NextResponse.json({ items });
}

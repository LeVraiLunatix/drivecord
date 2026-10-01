/**
 * POST /api/drive/[driveId]/files — record an uploaded file.
 *
 * Three kinds of rows arrive here:
 *  - plaintext / legacy single-IV files (`cryptoVersion` 0) and vault files (`locked`);
 *  - end-to-end encrypted files, format v1 (`cryptoVersion` 1): the client generated the
 *    id (so it could be bound into every AAD), wrapped the file key with the drive key and
 *    sealed name/type/size into `encMeta`. The server stores `filename = ""` and
 *    `mimeType = application/octet-stream` for those — it never learns either.
 */
import { recordChanges } from "@/lib/api-v2/drive";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getAuthorizedWebhook, toFileEntry } from "../../_helpers";
import { chunkRefsSchema, clientFileId, idLike, isResponse, readBody, wrappedBlob } from "@/lib/e2ee-server";
import { CHUNK_CIPHER } from "@/lib/crypto/e2ee/file-cipher";

const body = z.object({
  id: idLike,
  parentId: z.union([z.literal(""), idLike]),
  filename: z.string().max(1024).default(""),
  size: z.number().finite().nonnegative(),
  mimeType: z.string().max(255).default(""),
  chunkSize: z.number().int().positive().max(10 * 1024 * 1024),
  chunks: chunkRefsSchema.min(1),
  tags: z.array(z.string().max(64)).max(50).optional(),
  locked: z.boolean().optional(),
  encIv: z.string().max(64).nullish(),
  cryptoVersion: z.union([z.literal(0), z.literal(1)]).default(0),
  fkWrapped: wrappedBlob.nullish(),
  encMeta: wrappedBlob.nullish(),
  /** base64 of 7 bytes. */
  noncePrefix: z.string().regex(/^[A-Za-z0-9+/]{9}[AQgw]==$/).nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { webhook } = result;

  const b = await readBody(req, body, 4 * 1024 * 1024);
  if (isResponse(b)) return b;

  if (b.parentId !== "") {
    const parent = await prisma.driveFolder.findFirst({ where: { id: b.parentId, webhookId: webhook.id }, select: { id: true } });
    if (!parent) return NextResponse.json({ error: "Dossier de destination introuvable." }, { status: 400 });
  }

  let filename = b.filename;
  let mimeType = b.mimeType;
  let size = b.size;
  if (b.cryptoVersion >= 1) {
    if (webhook.e2eeVersion < 1) return NextResponse.json({ error: "Ce drive n'est pas chiffré de bout en bout." }, { status: 409 });
    if (!clientFileId.safeParse(b.id).success) return NextResponse.json({ error: "Identifiant de fichier invalide." }, { status: 400 });
    if (!b.fkWrapped || !b.encMeta || !b.noncePrefix || b.encIv || b.locked) {
      return NextResponse.json({ error: "Fichier chiffré incomplet." }, { status: 400 });
    }
    if (b.chunks.some((c) => c.size > CHUNK_CIPHER)) return NextResponse.json({ error: "Morceau trop grand." }, { status: 400 });
    // The stored size is the ciphertext size — the only thing the server can know.
    size = b.chunks.reduce((n, c) => n + c.size, 0);
    filename = "";
    mimeType = "application/octet-stream";
  }

  try {
    const row = await prisma.driveFile.create({
      data: {
        id: b.id,
        webhookId: webhook.id,
        driveId,
        parentId: b.parentId,
        filename,
        size: BigInt(Math.max(0, Math.trunc(size))),
        mimeType,
        chunkSize: b.chunkSize,
        chunks: b.chunks,
        tags: b.tags ?? [],
        locked: b.locked ?? false,
        encIv: b.encIv ?? null,
        cryptoVersion: b.cryptoVersion,
        fkWrapped: b.cryptoVersion >= 1 ? b.fkWrapped : null,
        encMeta: b.cryptoVersion >= 1 ? b.encMeta : null,
        noncePrefix: b.cryptoVersion >= 1 ? b.noncePrefix : null,
      },
    });
    await recordChanges(webhook.id, [{ type: "upsert", kind: "file", id: row.id }]);
    return NextResponse.json(toFileEntry(row), { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Ce fichier existe déjà." }, { status: 409 });
    }
    throw err;
  }
}

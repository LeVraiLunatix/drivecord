/**
 * Server-side validation for end-to-end-encrypted data. The server can't read
 * any of it — it can only check that blobs have the right SHAPE and size, so
 * garbage (or a giant payload) never lands in the database.
 */
import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDiscordCdnUrl, isSnowflake } from "@/lib/discord/cdn-url";

/** `v1.<base64 12-byte IV>.<base64 ciphertext+tag>` */
export const wrappedBlob = z.string().regex(/^v1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/, "Blob chiffré invalide.").max(8192);
export const b64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(512);

/** Client-generated ids (nanoid 21) so the id can be bound into the AAD before upload. */
export const clientFileId = z.string().regex(/^[A-Za-z0-9_-]{21}$/, "Identifiant de fichier invalide.");
export const idLike = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const phraseKdfSchema = z.object({
  alg: z.literal("argon2id"),
  m: z.number().int().min(8).max(1024 * 1024),
  t: z.number().int().min(1).max(20),
  p: z.number().int().min(1).max(8),
  salt: b64,
});

export const chunkRefSchema = z.object({
  index: z.number().int().min(0).max(9999),
  size: z.number().int().min(0).max(10 * 1024 * 1024),
  messageId: z.string().refine(isSnowflake, "messageId invalide"),
  attachmentId: z.string().refine(isSnowflake, "attachmentId invalide"),
  url: z.string().refine(isDiscordCdnUrl, "URL de CDN invalide"),
  expiresAt: z.number().finite().optional().default(0),
});
export const chunkRefsSchema = z.array(chunkRefSchema).max(10_000);

/** Session + fully-authenticated check for JSON routes. */
export async function requireUser(): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  return { userId: session.user.id };
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Parse a JSON body with zod, answering 400 (French, no echo of values) on failure. */
export async function readBody<T extends z.ZodType>(
  req: Request,
  schema: T,
  maxBytes = 512 * 1024,
): Promise<z.infer<T> | NextResponse> {
  const text = await req.text();
  if (text.length > maxBytes) return NextResponse.json({ error: "Corps trop volumineux." }, { status: 413 });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return badRequest("Corps JSON invalide.");
  }
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const path = issue?.path.join(".");
  return badRequest(`Requête invalide${path ? ` (\`${path}\`)` : ""} : ${issue?.message ?? "format incorrect"}`);
}

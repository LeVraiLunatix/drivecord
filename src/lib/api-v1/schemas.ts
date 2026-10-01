/**
 * zod schemas for everything a v1 client can send. Messages are French and
 * deliberately generic: they name the field, never echo the value back.
 */
import { z } from "zod";
import { HttpError } from "./errors";
import { DEFAULT_CHUNK_SIZE, DISCORD_FREE_UPLOAD_LIMIT } from "@/lib/discord/constants";
import { MAX_CHUNKS } from "@/lib/upload-session-core";

// Control chars, path separators, and bidi overrides/isolates (filename spoofing).
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f/\\‪-‮⁦-⁩]/;

/** 1–255 chars, NFC, no control chars, no `/` or `\`, and not `.` / `..`. */
export const nameSchema = z
  .string()
  .transform((s) => s.normalize("NFC").trim())
  .pipe(
    z
      .string()
      .min(1, "Nom vide.")
      .max(255, "Nom trop long (255 caractères maximum).")
      .refine((s) => s !== "." && s !== ".." && !FORBIDDEN.test(s), "Nom contenant des caractères interdits."),
  );

/** Ids we generate: nanoid / cuid alphabet. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identifiant invalide.");
/** `""` = drive root, otherwise a folder id. */
export const parentIdSchema = z.union([z.literal(""), idSchema]);

const snowflake = z.string().regex(/^\d{15,25}$/, "Identifiant Discord invalide.");

export const mimeSchema = z
  .string()
  .max(255)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}(\s*;.*)?$/i, "Type MIME invalide.");

/** JSON body of `POST /api/v1/files` (finalize a chunked upload). */
export const finalizeSchema = z
  .object({
    filename: nameSchema,
    mimeType: mimeSchema.optional(),
    parentId: parentIdSchema.optional(),
    size: z.number().int().nonnegative().optional(),
    chunkSize: z.number().int().min(1).max(DISCORD_FREE_UPLOAD_LIMIT).optional(),
    /** New flow: the server rebuilds the chunk list from its own records. */
    uploadId: idSchema.optional(),
    /** Legacy flow: only the ids are read; url/size/expiresAt are ignored. */
    chunks: z
      .array(
        z.object({
          index: z.number().int().min(0).max(MAX_CHUNKS - 1),
          messageId: snowflake,
          attachmentId: snowflake,
        }).passthrough(),
      )
      .min(1)
      .max(MAX_CHUNKS)
      .optional(),
  })
  .refine((b) => (b.uploadId !== undefined) !== (b.chunks !== undefined), {
    message: "Fournis soit `uploadId`, soit `chunks` (mode hérité), pas les deux.",
  });

export const folderCreateSchema = z.object({
  name: nameSchema,
  parentId: parentIdSchema.optional(),
});

export const DEFAULT_CHUNK = DEFAULT_CHUNK_SIZE;

/** Clamp a `limit` query param; garbage falls back to the default. */
export function parseLimit(raw: string | null, def: number, max: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : def;
}

const cursorSchema = z.string().max(300);
export function parseCursor(raw: string | null): string | null {
  if (raw === null) return null;
  const r = cursorSchema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "Paramètre `cursor` invalide.");
  return r.data;
}

/** Parse with zod; on failure throw a 400 naming the offending field. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const path = issue?.path.join(".");
  throw new HttpError(400, `Corps invalide${path ? ` (\`${path}\`)` : ""} : ${issue?.message ?? "format incorrect"}`);
}

/** Read and validate a JSON body (capped at 1 MiB — chunk lists are the biggest thing we accept). */
export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > 1024 * 1024) throw new HttpError(413, "Corps trop volumineux.");
  const text = await req.text();
  if (text.length > 1024 * 1024) throw new HttpError(413, "Corps trop volumineux.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Corps JSON invalide.");
  }
  return parse(schema, data);
}

/**
 * Strict input validation for `/api/v2`. Everything a client sends is checked
 * here, server-side, before it gets anywhere near the database: unknown body
 * fields are refused (no mass-assignment), strings are bounded, and ids must
 * match the exact alphabet we generate.
 */
import { ApiError, badRequest } from "./errors.ts";

/** Ids we generate: nanoid(12) (`A-Za-z0-9_-`) or cuid. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// Control chars, path separators, and bidi overrides/isolates (filename spoofing).
const FORBIDDEN_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f/\\\u202a-\u202e\u2066-\u2069]/;

export const MAX_NAME_LENGTH = 255;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 32;
export const MAX_SEARCH_LENGTH = 100;
export const MAX_BODY_BYTES = 16 * 1024;

/** Keep in sync with `FOLDER_COLOR_PRESETS` in `lib/folder-colors.ts` (test-enforced). */
export const FOLDER_COLORS = [
  "amber", "red", "orange", "lime", "green", "teal",
  "cyan", "blue", "violet", "purple", "pink", "zinc",
] as const;

export function parseId(value: unknown, field = "id"): string {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    throw badRequest(`\`${field}\` invalide.`);
  }
  return value;
}

/** `""` = drive root, otherwise a folder id. */
export function parseParentId(value: unknown, field = "parentId"): string {
  if (value === "") return "";
  return parseId(value, field);
}

export function parseName(value: unknown, field = "name"): string {
  if (typeof value !== "string") throw badRequest(`\`${field}\` doit être une chaîne.`);
  const name = value.normalize("NFC").trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw badRequest(`\`${field}\` doit faire entre 1 et ${MAX_NAME_LENGTH} caractères.`);
  }
  if (name === "." || name === ".." || FORBIDDEN_NAME_CHARS.test(name)) {
    throw badRequest(`\`${field}\` contient des caractères interdits.`);
  }
  return name;
}

export function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw badRequest(`\`${field}\` doit être un booléen.`);
  return value;
}

export function parseTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_TAGS) {
    throw badRequest(`\`tags\` doit être une liste de ${MAX_TAGS} étiquettes maximum.`);
  }
  const tags = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") throw badRequest("Chaque étiquette doit être une chaîne.");
    const tag = raw.normalize("NFC").trim();
    if (tag.length === 0 || tag.length > MAX_TAG_LENGTH || FORBIDDEN_NAME_CHARS.test(tag)) {
      throw badRequest(`Étiquette invalide (1 à ${MAX_TAG_LENGTH} caractères, sans caractère spécial).`);
    }
    tags.add(tag);
  }
  return [...tags];
}

/** `null` clears the color. */
export function parseColor(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !(FOLDER_COLORS as readonly string[]).includes(value)) {
    throw badRequest(`\`color\` doit être null ou l'une de : ${FOLDER_COLORS.join(", ")}.`);
  }
  return value;
}

// ── Query-string helpers ─────────────────────────────────────────────────────

export function parseLimit(raw: string | null, def: number, max: number): number {
  if (raw === null) return def;
  if (!/^\d{1,4}$/.test(raw)) throw badRequest("`limit` invalide.");
  const n = Number(raw);
  if (n < 1 || n > max) throw badRequest(`\`limit\` doit être entre 1 et ${max}.`);
  return n;
}

export function parseBoolParam(raw: string | null, field: string): boolean | undefined {
  if (raw === null) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw badRequest(`\`${field}\` doit valoir true ou false.`);
}

export function parseEnumParam<T extends string>(
  raw: string | null,
  field: string,
  allowed: readonly T[],
  def: T,
): T {
  if (raw === null) return def;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw badRequest(`\`${field}\` doit être l'un de : ${allowed.join(", ")}.`);
  }
  return raw as T;
}

export function parseSearch(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const q = raw.trim();
  if (q.length === 0 || q.length > MAX_SEARCH_LENGTH) {
    throw badRequest(`\`q\` doit faire entre 1 et ${MAX_SEARCH_LENGTH} caractères.`);
  }
  return q;
}

/** `image/` or `image/png` — a type, optionally a full subtype. */
export function parseMimePrefix(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9!#$&^_.+-]{0,126}$/i.test(raw)) {
    throw badRequest("`mimeType` invalide (ex. `image/` ou `application/pdf`).");
  }
  return raw.toLowerCase();
}

export function parseTimestampParam(raw: string | null, field: string): Date | undefined {
  if (raw === null) return undefined;
  if (!/^\d{1,15}$/.test(raw)) throw badRequest(`\`${field}\` doit être un horodatage Unix en ms.`);
  const d = new Date(Number(raw));
  if (Number.isNaN(d.getTime())) throw badRequest(`\`${field}\` invalide.`);
  return d;
}

// ── Body helpers ─────────────────────────────────────────────────────────────

/** Parse an already size-checked JSON text into a plain object. */
export function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Corps JSON invalide.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(400, "invalid_json", "Le corps doit être un objet JSON.");
  }
  return parsed as Record<string, unknown>;
}

/** Reject any field we don't know about. */
export function assertKnownKeys(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new ApiError(400, "unknown_field", `Champ inconnu : \`${key}\`.`);
    }
  }
}

export function assertNotEmpty(body: Record<string, unknown>): void {
  if (Object.keys(body).length === 0) throw badRequest("Aucun champ à modifier.");
}

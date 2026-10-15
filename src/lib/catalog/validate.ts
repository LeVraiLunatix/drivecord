/**
 * Strict validation for the community catalog (Quarry × Cord). Same rules as `api-v2/validate`:
 * unknown fields are refused, strings are bounded, ids match the alphabet we accept. Nothing a
 * client sends reaches the database unchecked.
 */
import { badRequest } from "../api-v2/errors.ts";
import { assertKnownKeys, assertNotEmpty, parseName, parseSearch } from "../api-v2/validate.ts";

export const PROJECT_TYPES = ["mod", "modpack", "resourcepack", "shader", "plugin"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
export const CHANNELS = ["release", "beta", "alpha"] as const;
export const DEPENDENCY_TYPES = ["required", "optional", "incompatible"] as const;
export const DEPENDENCY_SOURCES = ["catalog", "modrinth"] as const;

/** A project only ever ships the file type that makes sense for it: a stray `.exe` is refused. */
export const EXTENSIONS: Record<ProjectType, readonly string[]> = {
  mod: [".jar"],
  plugin: [".jar"],
  modpack: [".mrpack"],
  resourcepack: [".zip"],
  shader: [".zip"],
};

const MAX_FILES = 10;
const MAX_DEPENDENCIES = 50;
const MAX_LIST = 100;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
const VERSION_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const GAME_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/;
const WORD_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA512_RE = /^[0-9a-f]{128}$/;
const DEP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// Control characters (except tab and newline) and bidi overrides/isolates (text spoofing).
const FORBIDDEN_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/;

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") throw badRequest(`\`${field}\` doit être une chaîne.`);
  const v = value.normalize("NFC").trim();
  if (v.length < min || v.length > max) throw badRequest(`\`${field}\` doit faire entre ${min} et ${max} caractères.`);
  if (FORBIDDEN_TEXT.test(v)) throw badRequest(`\`${field}\` contient des caractères interdits.`);
  return v;
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw badRequest(`\`${field}\` doit être l'un de : ${allowed.join(", ")}.`);
  }
  return value as T;
}

function matching(value: unknown, field: string, re: RegExp, hint: string): string {
  if (typeof value !== "string" || !re.test(value)) throw badRequest(`\`${field}\` invalide (${hint}).`);
  return value;
}

function stringList(value: unknown, field: string, re: RegExp, hint: string, { min = 0, max = MAX_LIST } = {}): string[] {
  if (!Array.isArray(value) || value.length > max) throw badRequest(`\`${field}\` doit être une liste de ${max} éléments maximum.`);
  const out = new Set<string>();
  for (const item of value) out.add(matching(item, field, re, hint));
  if (out.size < min) throw badRequest(`\`${field}\` doit contenir au moins ${min} élément.`);
  return [...out];
}

/** `q` is optional: absent, empty or blank all mean "no filter" (a client that browses sends `q=`). */
export function parseOptionalSearch(raw: string | null): string | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  return parseSearch(raw);
}

export const parseSlug = (v: unknown, field = "slug") =>
  matching(v, field, SLUG_RE, "2 à 64 caractères : a-z, 0-9 et tirets, sans tiret au début");

export type ProjectInput = {
  slug: string;
  projectType: ProjectType;
  title: string;
  summary: string;
  description: string;
  categories: string[];
  iconToken: string | null;
};

const iconToken = (v: unknown) => matching(v, "iconToken", TOKEN_RE, "jeton de lien public");
const categories = (v: unknown) => stringList(v, "categories", WORD_RE, "a-z, 0-9, tirets", { max: 10 });

export function parseProjectCreate(body: Record<string, unknown>): ProjectInput {
  assertKnownKeys(body, ["slug", "projectType", "title", "summary", "description", "categories", "iconToken"]);
  return {
    slug: parseSlug(body.slug),
    projectType: oneOf(body.projectType, "projectType", PROJECT_TYPES),
    title: text(body.title, "title", 1, 80),
    summary: text(body.summary, "summary", 1, 200),
    description: body.description === undefined ? "" : text(body.description, "description", 0, 8000),
    categories: body.categories === undefined ? [] : categories(body.categories),
    iconToken: body.iconToken === undefined || body.iconToken === null ? null : iconToken(body.iconToken),
  };
}

export type ProjectPatch = Partial<Omit<ProjectInput, "slug" | "projectType">>;

/** The slug and the type never change once published: links and installed copies point at them. */
export function parseProjectPatch(body: Record<string, unknown>): ProjectPatch {
  assertKnownKeys(body, ["title", "summary", "description", "categories", "iconToken"]);
  assertNotEmpty(body);
  const out: ProjectPatch = {};
  if (body.title !== undefined) out.title = text(body.title, "title", 1, 80);
  if (body.summary !== undefined) out.summary = text(body.summary, "summary", 1, 200);
  if (body.description !== undefined) out.description = text(body.description, "description", 0, 8000);
  if (body.categories !== undefined) out.categories = categories(body.categories);
  if (body.iconToken !== undefined) out.iconToken = body.iconToken === null ? null : iconToken(body.iconToken);
  return out;
}

export type DependencyInput = {
  projectId: string;
  source: (typeof DEPENDENCY_SOURCES)[number];
  type: (typeof DEPENDENCY_TYPES)[number];
};
export type FileInput = { shareToken: string; filename: string; size: number; sha1: string; sha512: string; isPrimary: boolean };
export type VersionInput = {
  versionNumber: string;
  name: string;
  changelog: string;
  channel: (typeof CHANNELS)[number];
  gameVersions: string[];
  loaders: string[];
  dependencies: DependencyInput[];
  files: FileInput[];
};

function asObject(raw: unknown, what: string): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw badRequest(`${what} doit être un objet.`);
  return raw as Record<string, unknown>;
}

function parseDependency(raw: unknown): DependencyInput {
  const d = asObject(raw, "Chaque dépendance");
  assertKnownKeys(d, ["projectId", "source", "type"]);
  return {
    projectId: matching(d.projectId, "dependencies[].projectId", DEP_ID_RE, "identifiant ou slug"),
    source: oneOf(d.source, "dependencies[].source", DEPENDENCY_SOURCES),
    type: oneOf(d.type, "dependencies[].type", DEPENDENCY_TYPES),
  };
}

function parseFile(raw: unknown, projectType: ProjectType): FileInput {
  const f = asObject(raw, "Chaque fichier");
  assertKnownKeys(f, ["shareToken", "filename", "size", "sha1", "sha512", "primary"]);
  const filename = parseName(f.filename, "files[].filename");
  if (!EXTENSIONS[projectType].some((ext) => filename.toLowerCase().endsWith(ext))) {
    throw badRequest(`Un projet de type ${projectType} n'accepte que : ${EXTENSIONS[projectType].join(", ")}.`);
  }
  if (typeof f.size !== "number" || !Number.isSafeInteger(f.size) || f.size <= 0) {
    throw badRequest("`files[].size` doit être un entier positif.");
  }
  if (f.primary !== undefined && typeof f.primary !== "boolean") throw badRequest("`files[].primary` doit être un booléen.");
  return {
    shareToken: matching(f.shareToken, "files[].shareToken", TOKEN_RE, "jeton de lien public"),
    filename,
    size: f.size,
    sha1: matching(f.sha1, "files[].sha1", SHA1_RE, "40 caractères hexadécimaux en minuscules"),
    sha512: matching(f.sha512, "files[].sha512", SHA512_RE, "128 caractères hexadécimaux en minuscules"),
    isPrimary: f.primary === true,
  };
}

export function parseVersionCreate(body: Record<string, unknown>, projectType: ProjectType): VersionInput {
  assertKnownKeys(body, ["versionNumber", "name", "changelog", "channel", "gameVersions", "loaders", "dependencies", "files"]);
  if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > MAX_FILES) {
    throw badRequest(`\`files\` doit contenir de 1 à ${MAX_FILES} fichiers.`);
  }
  const files = body.files.map((f) => parseFile(f, projectType));
  if (new Set(files.map((f) => f.shareToken)).size !== files.length) {
    throw badRequest("Le même lien public ne peut pas figurer deux fois.");
  }
  // One file: it is the primary one. Several: exactly one must say so.
  if (files.length === 1) files[0]!.isPrimary = true;
  if (files.filter((f) => f.isPrimary).length !== 1) throw badRequest("Exactement un fichier doit être `primary: true`.");

  const rawDeps = body.dependencies === undefined ? [] : body.dependencies;
  if (!Array.isArray(rawDeps) || rawDeps.length > MAX_DEPENDENCIES) {
    throw badRequest(`\`dependencies\` : ${MAX_DEPENDENCIES} au maximum.`);
  }

  return {
    versionNumber: matching(body.versionNumber, "versionNumber", VERSION_NUMBER_RE, "1 à 64 caractères : lettres, chiffres, . _ + -"),
    name: text(body.name, "name", 1, 100),
    changelog: body.changelog === undefined ? "" : text(body.changelog, "changelog", 0, 4000),
    channel: body.channel === undefined ? "release" : oneOf(body.channel, "channel", CHANNELS),
    gameVersions: stringList(body.gameVersions, "gameVersions", GAME_VERSION_RE, "ex. 1.21.1", { min: 1 }),
    loaders: stringList(body.loaders, "loaders", WORD_RE, "ex. fabric", { min: 1, max: 20 }),
    dependencies: rawDeps.map(parseDependency),
    files,
  };
}

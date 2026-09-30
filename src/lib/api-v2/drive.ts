/**
 * Drive access for API v2: resolves the principal's webhook, confines app tokens to their
 * folder subtree, serializes rows and feeds the change journal.
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Webhook } from "@/generated/prisma/client";
import { rateLimit } from "@/lib/rate-limit";
import { ApiError } from "./errors";
import { subtreeIds } from "./tree";
import { maxApiBytesPerDay } from "@/lib/api-v1/guards";
import type { Principal } from "./principal";

export type Scope = {
  webhook: Webhook;
  /** null = whole drive (PAT); otherwise the only folders an app may touch. */
  allowed: Set<string> | null;
  appFolderId: string | null;
};

export async function loadScope(p: Principal): Promise<Scope> {
  const webhook = await prisma.webhook.findUnique({ where: { id: p.webhookId } });
  if (!webhook || webhook.userId !== p.userId) throw new ApiError(401, "unauthorized", "Jeton d'accès invalide ou manquant.");
  if (p.kind === "pat") return { webhook, allowed: null, appFolderId: null };
  if (!p.appFolderId) throw new ApiError(403, "insufficient_scope", "Cette application n'a pas de dossier dédié.");
  const folders = await prisma.driveFolder.findMany({ where: { webhookId: webhook.id }, select: { id: true, parentId: true } });
  const root = folders.find((f) => f.id === p.appFolderId);
  if (!root) throw new ApiError(403, "insufficient_scope", "Le dossier de l'application n'existe plus.");
  return { webhook, allowed: new Set(subtreeIds(folders, p.appFolderId)), appFolderId: p.appFolderId };
}

/** `""` means "my default folder": the app folder for apps, the root for personal tokens. */
export function resolveParent(scope: Scope, parentId: string | undefined): string {
  return parentId === undefined ? (scope.appFolderId ?? "") : parentId;
}

export function assertFolderAllowed(scope: Scope, folderId: string, what: "folder" | "parent" = "folder"): void {
  const miss = () =>
    what === "parent"
      ? new ApiError(400, "parent_not_found", "Dossier de destination introuvable.")
      : new ApiError(404, "folder_not_found", "Dossier introuvable.");
  if (scope.allowed === null) return;
  if (!scope.allowed.has(folderId)) throw miss(); // same answer as "doesn't exist": no probing outside the app folder
}

export async function assertParentUsable(scope: Scope, parentId: string): Promise<void> {
  if (parentId === "") {
    if (scope.allowed) throw new ApiError(400, "parent_not_found", "Dossier de destination introuvable.");
    return;
  }
  assertFolderAllowed(scope, parentId, "parent");
  const parent = await prisma.driveFolder.findFirst({ where: { id: parentId, webhookId: scope.webhook.id }, select: { trashed: true } });
  if (!parent) throw new ApiError(400, "parent_not_found", "Dossier de destination introuvable.");
  if (parent.trashed) throw new ApiError(400, "parent_trashed", "Le dossier de destination est dans la corbeille.");
}

export async function findFile(scope: Scope, id: string) {
  const file = await prisma.driveFile.findFirst({ where: { id, webhookId: scope.webhook.id, locked: false } });
  if (!file || (scope.allowed && !scope.allowed.has(file.parentId))) throw new ApiError(404, "file_not_found", "Fichier introuvable.");
  return file;
}

export async function findFolder(scope: Scope, id: string) {
  if (scope.allowed && !scope.allowed.has(id)) throw new ApiError(404, "folder_not_found", "Dossier introuvable.");
  const folder = await prisma.driveFolder.findFirst({ where: { id, webhookId: scope.webhook.id } });
  if (!folder) throw new ApiError(404, "folder_not_found", "Dossier introuvable.");
  return folder;
}

export async function recordChange(webhookId: string, type: "upsert" | "delete", kind: "file" | "folder", itemId: string) {
  await prisma.changeLog.create({ data: { webhookId, type, kind, itemId } }).catch(() => {});
}

type FileRow = Awaited<ReturnType<typeof findFile>>;
export function serializeFile(f: FileRow) {
  const pub = f.visibility === "public";
  return {
    id: f.id,
    parentId: f.parentId,
    visibility: f.visibility,
    /** Stored (ciphertext) size for private files, real size for public ones. */
    size: f.size,
    chunkSize: f.chunkSize,
    chunkCount: (f.chunks as unknown[]).length,
    cryptoVersion: f.cryptoVersion,
    encMeta: f.encMeta,
    fkWrapped: f.fkWrapped,
    noncePrefix: f.noncePrefix,
    ...(pub ? { filename: f.filename, mimeType: f.mimeType } : {}),
    trashed: f.trashed,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

type FolderRow = Awaited<ReturnType<typeof findFolder>>;
export function serializeFolder(f: FolderRow) {
  return {
    id: f.id,
    parentId: f.parentId,
    encName: f.encName,
    color: f.color,
    trashed: f.trashed,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

/** Daily upload budget per account (shared with v1). */
export async function consumeByteQuota(userId: string, bytes: number) {
  const kib = Math.max(1, Math.ceil(bytes / 1024));
  const r = await rateLimit(`apiquota:bytes:${userId}`, Math.floor(maxApiBytesPerDay() / 1024), 86_400, { amount: kib, refundOnReject: true });
  if (!r.ok) throw new ApiError(429, "quota_exceeded", "Quota d'envoi quotidien de l'API atteint.", { "Retry-After": String(r.retryAfterSec) });
}

/** Validate with zod; any issue → uniform 400. */
export function zparse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    if (issue?.code === "unrecognized_keys") throw new ApiError(400, "unknown_field", `Champ inconnu : \`${issue.keys[0]}\`.`);
    throw new ApiError(400, "invalid_request", `Requête invalide${issue ? ` (${issue.path.join(".") || "corps"}: ${issue.message})` : ""}.`);
  }
  return r.data;
}

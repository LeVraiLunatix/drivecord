/**
 * Ownership + quota guards for `/api/v1` routes. Every lookup is scoped by the
 * key's `webhookId`, so an id belonging to another drive behaves as "not found".
 */
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { HttpError } from "./errors";

const GIB = 1024 ** 3;

function envInt(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
}

/** Daily upload volume per account, through the API. */
export const maxApiBytesPerDay = () => envInt("MAX_API_GIB_PER_DAY", 20) * GIB;
/** Files a drive may hold once it reaches this count via the API. */
export const maxApiFilesPerDrive = () => envInt("MAX_API_FILES_PER_DRIVE", 100_000);

/** Destination folder must exist in THIS drive and not be in the trash. `""` = root. */
export async function assertParentUsable(webhookId: string, parentId: string): Promise<void> {
  if (parentId === "") return;
  const parent = await prisma.driveFolder.findFirst({
    where: { id: parentId, webhookId },
    select: { trashed: true },
  });
  if (!parent) throw new HttpError(400, "Dossier de destination introuvable.");
  if (parent.trashed) throw new HttpError(400, "Le dossier de destination est dans la corbeille.");
}

/**
 * Reserve `bytes` of the account's daily upload budget. Counted in KiB so a
 * 20 GiB/day budget fits the counter's int32. A refused upload costs nothing.
 */
export async function consumeByteQuota(userId: string, bytes: number): Promise<void> {
  const kib = Math.max(1, Math.ceil(bytes / 1024));
  const r = await rateLimit(`apiquota:bytes:${userId}`, Math.floor(maxApiBytesPerDay() / 1024), 86_400, {
    amount: kib,
    refundOnReject: true,
  });
  if (!r.ok) {
    throw new HttpError(429, "Quota d'envoi quotidien de l'API atteint. Réessaie plus tard.", {
      headers: { "Retry-After": String(r.retryAfterSec) },
    });
  }
}

export async function assertFileQuota(webhookId: string): Promise<void> {
  const count = await prisma.driveFile.count({ where: { webhookId } });
  if (count >= maxApiFilesPerDrive()) {
    throw new HttpError(409, "Nombre maximal de fichiers atteint pour ce drive.");
  }
}

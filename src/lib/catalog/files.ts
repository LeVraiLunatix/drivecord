/**
 * A catalog file is only a pointer to a Drivecord public link, so before accepting one we check
 * that the link really belongs to the publisher's drive, is live, and serves what was declared.
 */
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-v2/errors";

const invalid = (message: string) => new ApiError(400, "invalid_request", message);

/** Returns the stored size and MIME type of the file behind `shareToken`, or throws a 400. */
export async function assertPublicLink(webhookId: string, shareToken: string): Promise<{ size: number; mimeType: string }> {
  const share = await prisma.share.findUnique({ where: { token: shareToken } });
  if (!share || share.webhookId !== webhookId) throw invalid("Lien public introuvable dans ton drive.");
  if (share.disabledAt) throw invalid("Ce lien public est désactivé.");
  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) throw invalid("Ce lien public a expiré.");
  if (share.passwordHash || share.fkWrappedForShare) throw invalid("Un lien protégé par mot de passe ne peut pas être publié.");

  const file = await prisma.driveFile.findFirst({ where: { id: share.fileId, webhookId } });
  if (!file || file.trashed) throw invalid("Le fichier de ce lien n'existe plus.");
  // Only files deliberately stored in clear (`visibility: "public"`) can be served to everyone.
  if (file.visibility !== "public") throw invalid("Le fichier doit avoir été envoyé avec `visibility: \"public\"`.");
  return { size: file.size, mimeType: file.mimeType };
}

/** Same checks, plus the size the publisher declared must be the real one. */
export async function assertDeclaredFile(webhookId: string, shareToken: string, declaredSize: number): Promise<void> {
  const { size } = await assertPublicLink(webhookId, shareToken);
  if (size !== declaredSize) throw invalid(`La taille déclarée (${declaredSize}) ne correspond pas au fichier (${size}).`);
}

/** An icon must be an image. */
export async function assertIcon(webhookId: string, shareToken: string): Promise<void> {
  const { mimeType } = await assertPublicLink(webhookId, shareToken);
  if (!mimeType.startsWith("image/")) throw invalid("L'icône doit être une image.");
}

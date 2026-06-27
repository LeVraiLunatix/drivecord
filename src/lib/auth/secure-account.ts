/**
 * « Sécuriser le compte » : jeton à usage unique inclus dans les emails de
 * vérification de connexion. Si la personne légitime reçoit un code qu'elle n'a
 * pas demandé (« ce n'était pas moi »), elle clique le lien et réinitialise son
 * mot de passe, ce qui coupe l'accès à l'attaquant.
 *
 * Réutilise la table `EmailVerificationToken` (purpose "secure_account") : le
 * champ `codeHash` y stocke le SHA-256 d'un jeton aléatoire long (jamais un code
 * à 6 chiffres). Aucune migration nécessaire.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashCode } from "./email-code";

const PURPOSE = "secure_account";
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min

/** Crée un jeton et renvoie sa valeur en clair (à mettre dans le lien de l'email). */
export async function createSecureAccountToken(
  userId: string,
  email: string,
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      email,
      codeHash: hashCode(token),
      purpose: PURPOSE,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return token;
}

export type SecureToken = { id: string; userId: string; email: string };

/** Valide un jeton sans le consommer. Null si absent/expiré/déjà utilisé. */
export async function verifySecureAccountToken(
  token: string,
): Promise<SecureToken | null> {
  if (!token || token.length < 32) return null;
  const row = await prisma.emailVerificationToken.findFirst({
    where: { purpose: PURPOSE, codeHash: hashCode(token), consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row || !row.userId) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, userId: row.userId, email: row.email };
}

/** Marque le jeton comme consommé (usage unique). */
export async function consumeSecureAccountToken(id: string): Promise<void> {
  await prisma.emailVerificationToken
    .update({ where: { id }, data: { consumedAt: new Date() } })
    .catch(() => {});
}

/**
 * Publishing is reserved to the Drivecord admin (`ADMIN_EMAIL`) using a personal access token:
 * an OAuth app token can never publish. Reading the catalog needs no account at all.
 */
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/admin";
import { ApiError } from "@/lib/api-v2/errors";
import type { Principal } from "@/lib/api-v2/principal";

export async function requireCatalogAdmin(principal: Principal): Promise<{ userId: string; webhookId: string }> {
  if (principal.kind !== "pat") throw new ApiError(403, "insufficient_scope", "La publication exige un jeton personnel.");
  const user = await prisma.user.findUnique({ where: { id: principal.userId }, select: { email: true } });
  if (!isAdminEmail(user?.email)) {
    throw new ApiError(403, "insufficient_scope", "La publication est réservée à l'administrateur.");
  }
  return { userId: principal.userId, webhookId: principal.webhookId };
}

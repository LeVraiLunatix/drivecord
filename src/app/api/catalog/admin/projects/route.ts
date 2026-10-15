/**
 * POST /api/catalog/admin/projects — create a catalog project.
 * Personal access token of the admin only (`ADMIN_EMAIL`); nobody else can publish.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-v2/errors";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { requireCatalogAdmin } from "@/lib/catalog/access";
import { assertIcon } from "@/lib/catalog/files";
import { parseProjectCreate } from "@/lib/catalog/validate";

export const runtime = "nodejs";
export const OPTIONS = preflight("POST, OPTIONS");

export const POST = v2Route({ cap: "owner", bucket: BUCKETS.write, route: "/api/catalog/admin/projects", json: true, idempotent: true }, async ({ principal, body }) => {
  const admin = await requireCatalogAdmin(principal);
  const input = parseProjectCreate(body);
  if (input.iconToken) await assertIcon(admin.webhookId, input.iconToken);
  try {
    const project = await prisma.catalogProject.create({ data: { ...input, ownerId: admin.userId } });
    return ok({ id: project.id, slug: project.slug }, 201);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "conflict", "Ce slug est déjà pris.");
    }
    throw e;
  }
});

/** DELETE /api/catalog/admin/projects/[slug]/versions/[id] — take one version down (soft removal). */
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-v2/errors";
import { BUCKETS, noContent, preflight, v2Route } from "@/lib/api-v2/http";
import { parseId } from "@/lib/api-v2/validate";
import { requireCatalogAdmin } from "@/lib/catalog/access";
import { parseSlug } from "@/lib/catalog/validate";

export const runtime = "nodejs";
export const OPTIONS = preflight("DELETE, OPTIONS");
type P = { slug: string; id: string };

export const DELETE = v2Route<P>({ cap: "owner", bucket: BUCKETS.delete, route: "/api/catalog/admin/projects/[slug]/versions/[id]" }, async ({ principal, params }) => {
  await requireCatalogAdmin(principal);
  const version = await prisma.catalogVersion.findFirst({
    where: { id: parseId(params.id), status: "published", project: { slug: parseSlug(params.slug) } },
    select: { id: true },
  });
  if (!version) throw new ApiError(404, "not_found", "Version introuvable.");
  await prisma.catalogVersion.update({ where: { id: version.id }, data: { status: "removed" } });
  return noContent();
});

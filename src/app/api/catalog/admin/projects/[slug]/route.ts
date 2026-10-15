/**
 * PATCH / DELETE /api/catalog/admin/projects/[slug] — edit a project, or take it down.
 * DELETE is a soft removal: the project and its versions stop being served, the rows stay.
 */
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-v2/errors";
import { BUCKETS, noContent, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { requireCatalogAdmin } from "@/lib/catalog/access";
import { assertIcon } from "@/lib/catalog/files";
import { parseProjectPatch, parseSlug } from "@/lib/catalog/validate";

export const runtime = "nodejs";
export const OPTIONS = preflight("PATCH, DELETE, OPTIONS");
type P = { slug: string };

async function find(slug: string) {
  const project = await prisma.catalogProject.findFirst({ where: { slug: parseSlug(slug), status: "published" } });
  if (!project) throw new ApiError(404, "not_found", "Projet introuvable.");
  return project;
}

export const PATCH = v2Route<P>({ cap: "owner", bucket: BUCKETS.write, route: "/api/catalog/admin/projects/[slug]", json: true }, async ({ principal, params, body }) => {
  const admin = await requireCatalogAdmin(principal);
  const project = await find(params.slug);
  const patch = parseProjectPatch(body);
  if (patch.iconToken) await assertIcon(admin.webhookId, patch.iconToken);
  const updated = await prisma.catalogProject.update({ where: { id: project.id }, data: patch });
  return ok({ id: updated.id, slug: updated.slug });
});

export const DELETE = v2Route<P>({ cap: "owner", bucket: BUCKETS.delete, route: "/api/catalog/admin/projects/[slug]" }, async ({ principal, params }) => {
  await requireCatalogAdmin(principal);
  const project = await find(params.slug);
  await prisma.catalogProject.update({ where: { id: project.id }, data: { status: "removed", removedAt: new Date() } });
  return noContent();
});

/**
 * POST /api/catalog/admin/projects/[slug]/versions — publish a version.
 * Every file points at a Drivecord public link of the admin's own drive; the link, its size and
 * its extension are checked here, and the hashes are what Quarry verifies at install time.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-v2/errors";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { requireCatalogAdmin } from "@/lib/catalog/access";
import { assertDeclaredFile } from "@/lib/catalog/files";
import { parseSlug, parseVersionCreate, type ProjectType } from "@/lib/catalog/validate";

export const runtime = "nodejs";
export const OPTIONS = preflight("POST, OPTIONS");
type P = { slug: string };

export const POST = v2Route<P>({ cap: "owner", bucket: BUCKETS.write, route: "/api/catalog/admin/projects/[slug]/versions", json: true, idempotent: true }, async ({ principal, params, body }) => {
  const admin = await requireCatalogAdmin(principal);
  const project = await prisma.catalogProject.findFirst({ where: { slug: parseSlug(params.slug), status: "published" } });
  if (!project) throw new ApiError(404, "not_found", "Projet introuvable.");

  const input = parseVersionCreate(body, project.projectType as ProjectType);
  for (const f of input.files) await assertDeclaredFile(admin.webhookId, f.shareToken, f.size);

  try {
    const [version] = await prisma.$transaction([
      prisma.catalogVersion.create({
        data: {
          projectId: project.id,
          versionNumber: input.versionNumber,
          name: input.name,
          changelog: input.changelog,
          channel: input.channel,
          gameVersions: input.gameVersions,
          loaders: input.loaders,
          dependencies: input.dependencies,
          files: {
            create: input.files.map((f) => ({
              shareToken: f.shareToken,
              filename: f.filename,
              size: BigInt(f.size),
              sha1: f.sha1,
              sha512: f.sha512,
              isPrimary: f.isPrimary,
            })),
          },
        },
      }),
      // A new version makes the project "recently updated".
      prisma.catalogProject.update({ where: { id: project.id }, data: { updatedAt: new Date() } }),
    ]);
    return ok({ id: version.id, versionNumber: version.versionNumber }, 201);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "conflict", "Cette version existe déjà pour ce projet.");
    }
    throw e;
  }
});

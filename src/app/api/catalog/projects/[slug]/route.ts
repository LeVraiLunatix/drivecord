/** GET /api/catalog/projects/[slug] — one project, with the Markdown body (no account needed). */
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-v2/errors";
import { catalogPreflight, publicRoute } from "@/lib/catalog/http";
import { toProject } from "@/lib/catalog/serialize";
import { parseSlug } from "@/lib/catalog/validate";

export const runtime = "nodejs";
export const OPTIONS = catalogPreflight("GET, OPTIONS");
type P = { slug: string };

export const GET = publicRoute<P>(
  async ({ req, params }) => {
    const project = await prisma.catalogProject.findFirst({
      where: { slug: parseSlug(params.slug), status: "published" },
      include: { versions: { where: { status: "published" }, select: { id: true, gameVersions: true, loaders: true } } },
    });
    if (!project) throw new ApiError(404, "not_found", "Projet introuvable.");
    return Response.json(toProject(project, req.url));
  },
  { cache: "public, max-age=30, s-maxage=30" },
);

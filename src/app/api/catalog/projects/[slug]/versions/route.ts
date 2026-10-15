/**
 * GET /api/catalog/projects/[slug]/versions — the versions of a project, newest first.
 * Query: game_version, loaders (comma list), channel (release | beta | alpha).
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError, badRequest } from "@/lib/api-v2/errors";
import { parseEnumParam } from "@/lib/api-v2/validate";
import { catalogPreflight, publicRoute } from "@/lib/catalog/http";
import { toVersion } from "@/lib/catalog/serialize";
import { CHANNELS, parseSlug } from "@/lib/catalog/validate";

export const runtime = "nodejs";
export const OPTIONS = catalogPreflight("GET, OPTIONS");
type P = { slug: string };

const WORD = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const GAME_VERSION = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/;

export const GET = publicRoute<P>(
  async ({ req, params }) => {
    const sp = req.nextUrl.searchParams;
    const gameVersion = sp.get("game_version");
    if (gameVersion !== null && !GAME_VERSION.test(gameVersion)) throw badRequest("`game_version` invalide.");
    const loaders = (sp.get("loaders") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (loaders.length > 10 || loaders.some((l) => !WORD.test(l))) throw badRequest("`loaders` invalide.");
    const channel = sp.get("channel") === null ? undefined : parseEnumParam(sp.get("channel"), "channel", CHANNELS, "release");

    const project = await prisma.catalogProject.findFirst({
      where: { slug: parseSlug(params.slug), status: "published" },
      select: { id: true },
    });
    if (!project) throw new ApiError(404, "not_found", "Projet introuvable.");

    const where: Prisma.CatalogVersionWhereInput = {
      projectId: project.id,
      status: "published",
      ...(gameVersion ? { gameVersions: { has: gameVersion } } : {}),
      ...(loaders.length ? { loaders: { hasSome: loaders } } : {}),
      ...(channel ? { channel } : {}),
    };
    const versions = await prisma.catalogVersion.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      include: { files: true },
    });
    return Response.json(versions.map((v) => toVersion(v, req.url)));
  },
  { cache: "public, max-age=30, s-maxage=30" },
);

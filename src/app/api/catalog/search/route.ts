/**
 * GET /api/catalog/search — browse the community catalog (no account needed).
 * Query: q, type, loaders (comma list), game_version, categories (comma list),
 * sort = relevance | downloads | newest | updated, offset, limit (max 50).
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { badRequest } from "@/lib/api-v2/errors";
import { parseEnumParam, parseLimit, parseSearch } from "@/lib/api-v2/validate";
import { catalogPreflight, publicRoute } from "@/lib/catalog/http";
import { toHit } from "@/lib/catalog/serialize";
import { PROJECT_TYPES } from "@/lib/catalog/validate";

export const runtime = "nodejs";
export const OPTIONS = catalogPreflight("GET, OPTIONS");

const SORTS = ["relevance", "downloads", "newest", "updated"] as const;
const WORD = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const GAME_VERSION = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/;

function words(raw: string | null, field: string): string[] {
  if (!raw) return [];
  const list = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length > 10 || list.some((w) => !WORD.test(w))) throw badRequest(`\`${field}\` invalide.`);
  return list;
}

/** Prisma's `contains` does not escape LIKE wildcards: a typed `%` or `_` would match everything. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

const ORDER: Record<(typeof SORTS)[number], Prisma.CatalogProjectOrderByWithRelationInput[]> = {
  relevance: [{ downloads: "desc" }, { updatedAt: "desc" }],
  downloads: [{ downloads: "desc" }, { id: "asc" }],
  newest: [{ createdAt: "desc" }, { id: "asc" }],
  updated: [{ updatedAt: "desc" }, { id: "asc" }],
};

export const GET = publicRoute(
  async ({ req }) => {
    const sp = req.nextUrl.searchParams;
    const q = parseSearch(sp.get("q"));
    const type = sp.get("type") === null ? undefined : parseEnumParam(sp.get("type"), "type", PROJECT_TYPES, "mod");
    const sort = parseEnumParam(sp.get("sort"), "sort", SORTS, "relevance");
    const limit = parseLimit(sp.get("limit"), 20, 50);
    const offsetRaw = sp.get("offset");
    if (offsetRaw !== null && !/^\d{1,6}$/.test(offsetRaw)) throw badRequest("`offset` invalide.");
    const offset = offsetRaw === null ? 0 : Number(offsetRaw);
    const loaders = words(sp.get("loaders"), "loaders");
    const categories = words(sp.get("categories"), "categories");
    const gameVersion = sp.get("game_version");
    if (gameVersion !== null && !GAME_VERSION.test(gameVersion)) throw badRequest("`game_version` invalide.");

    // A project shows up only if at least one published version fits what was asked.
    const version: Prisma.CatalogVersionWhereInput = {
      status: "published",
      ...(gameVersion ? { gameVersions: { has: gameVersion } } : {}),
      ...(loaders.length ? { loaders: { hasSome: loaders } } : {}),
    };
    const where: Prisma.CatalogProjectWhereInput = {
      status: "published",
      versions: { some: version },
      ...(type ? { projectType: type } : {}),
      ...(categories.length ? { categories: { hasEvery: categories } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: escapeLike(q), mode: "insensitive" } },
              { summary: { contains: escapeLike(q), mode: "insensitive" } },
              { slug: { contains: escapeLike(q.toLowerCase()) } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.catalogProject.findMany({
        where,
        orderBy: ORDER[sort],
        skip: offset,
        take: limit,
        include: { versions: { where: { status: "published" }, select: { id: true, gameVersions: true, loaders: true } } },
      }),
      prisma.catalogProject.count({ where }),
    ]);

    return Response.json({ hits: rows.map((p) => toHit(p, req.url)), offset, limit, total_hits: total });
  },
  { cache: "public, max-age=30, s-maxage=30" },
);

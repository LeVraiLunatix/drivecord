/**
 * JSON shapes of the public catalog API. Field names follow Modrinth's (`project_id`, `slug`,
 * `version_number`, `files[].hashes.sha512`…) so Quarry reuses the same types and the same
 * install code (hash check, dependencies) for both sources.
 */
import type { CatalogFile, CatalogProject, CatalogVersion } from "@/generated/prisma/client";
import { publicFileUrl } from "@/lib/usercontent";
import type { DependencyInput } from "./validate";

const union = (lists: string[][]) => [...new Set(lists.flat())];

type VersionWithFiles = CatalogVersion & { files: CatalogFile[] };
type ProjectWithVersions = CatalogProject & { versions: Pick<CatalogVersion, "id" | "gameVersions" | "loaders">[] };

const iconUrl = (p: CatalogProject, requestUrl: string) => (p.iconToken ? publicFileUrl(p.iconToken, requestUrl) : null);

/** A search result (no long description). */
export function toHit(p: ProjectWithVersions, requestUrl: string) {
  return {
    project_id: p.id,
    slug: p.slug,
    project_type: p.projectType,
    title: p.title,
    description: p.summary,
    categories: p.categories,
    icon_url: iconUrl(p, requestUrl),
    author: "Quarry",
    downloads: p.downloads,
    versions: union(p.versions.map((v) => v.gameVersions)),
    loaders: union(p.versions.map((v) => v.loaders)),
    date_created: p.createdAt.toISOString(),
    date_modified: p.updatedAt.toISOString(),
    source: "cord",
  };
}

/** The project page (Markdown body included). */
export function toProject(p: ProjectWithVersions, requestUrl: string) {
  return {
    ...toHit(p, requestUrl),
    id: p.id,
    body: p.description,
    versions: p.versions.map((v) => v.id),
    game_versions: union(p.versions.map((v) => v.gameVersions)),
  };
}

export function toVersion(v: VersionWithFiles, requestUrl: string) {
  return {
    id: v.id,
    project_id: v.projectId,
    version_number: v.versionNumber,
    name: v.name,
    changelog: v.changelog,
    version_type: v.channel,
    game_versions: v.gameVersions,
    loaders: v.loaders,
    dependencies: (v.dependencies as DependencyInput[]).map((d) => ({
      project_id: d.projectId,
      source: d.source,
      dependency_type: d.type,
    })),
    date_published: v.createdAt.toISOString(),
    downloads: v.downloads,
    files: v.files.map((f) => ({
      url: publicFileUrl(f.shareToken, requestUrl),
      filename: f.filename,
      size: Number(f.size),
      primary: f.isPrimary,
      hashes: { sha1: f.sha1, sha512: f.sha512 },
    })),
  };
}

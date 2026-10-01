import type { MetadataRoute } from "next";
import { loadIncidents } from "@/lib/incidents";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const s = siteUrl();
  return [
    { url: `${s}/` },
    { url: `${s}/nouveautes` },
    { url: `${s}/history` },
    ...loadIncidents().map((i) => ({ url: `${s}/incidents/${i.slug}`, lastModified: new Date(i.updates[0]?.at ?? i.startedAt) })),
  ];
}

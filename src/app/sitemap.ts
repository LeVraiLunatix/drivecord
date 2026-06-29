import { MetadataRoute } from "next";
import { readyDocs } from "@/lib/docs/nav";

const BASE = "https://drivecord.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/install`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/conditions`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Toutes les pages de documentation réellement publiées.
  const docPages: MetadataRoute.Sitemap = readyDocs().map((d) => ({
    url: `${BASE}${d.href}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticPages, ...docPages];
}

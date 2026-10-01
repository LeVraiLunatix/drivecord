import { INCIDENT_STATUS_FR } from "./incidents";
import type { ChangelogEntry, Incident } from "./types";

export const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Characters XML 1.0 forbids would make the whole feed unparseable.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

type FeedEntry = { id: string; title: string; url: string; updated: string; summary: string };

const toIso = (d: string): string => new Date(d).toISOString();

export function feedEntries(incidents: Incident[], changelog: ChangelogEntry[], site: string): FeedEntry[] {
  const fromIncidents = incidents.map((i): FeedEntry => {
    const latest = i.updates[0];
    return {
      id: `${site}/incidents/${i.slug}`,
      title: `${i.severity === "maintenance" ? "Maintenance" : "Incident"} : ${i.title} (${INCIDENT_STATUS_FR[i.status]})`,
      url: `${site}/incidents/${i.slug}`,
      updated: toIso(latest?.at ?? i.resolvedAt ?? i.startedAt),
      summary: latest?.body || i.summary || i.title,
    };
  });
  const fromChangelog = changelog
    .filter((c) => c.date)
    .map((c): FeedEntry => ({ id: `${site}/nouveautes#${c.slug}`, title: `Nouveautés : ${c.title}`, url: `${site}/nouveautes#${c.slug}`, updated: toIso(c.date!), summary: c.markdown.slice(0, 600) }));
  return [...fromIncidents, ...fromChangelog].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
}

/** Atom 1.0 feed of incidents, maintenances and news. */
export function buildAtom(site: string, entries: FeedEntry[], now: Date = new Date()): string {
  const updated = entries[0]?.updated ?? now.toISOString();
  const items = entries
    .map(
      (e) => `  <entry>
    <id>${xmlEscape(e.id)}</id>
    <title>${xmlEscape(e.title)}</title>
    <link href="${xmlEscape(e.url)}"/>
    <updated>${e.updated}</updated>
    <summary>${xmlEscape(e.summary)}</summary>
  </entry>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">
  <id>${xmlEscape(site)}/</id>
  <title>Statut de Drivecord</title>
  <subtitle>Incidents, maintenances et nouveautés de Drivecord</subtitle>
  <link href="${xmlEscape(site)}/"/>
  <link rel="self" href="${xmlEscape(site)}/feed.xml"/>
  <updated>${updated}</updated>
${items}
</feed>
`;
}

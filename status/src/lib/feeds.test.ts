import { describe, expect, it } from "vitest";
import { buildAtom, feedEntries, xmlEscape } from "./feeds";
import { parseIncident } from "./incidents";

const SITE = "https://status.example";
const incident = parseIncident(
  "panne-envoi",
  `---\ntitle: Panne <envoi> & "relais"\nstatus: resolved\nseverity: major_outage\nstartedAt: 2026-10-01T10:00:00Z\nresolvedAt: 2026-10-01T11:00:00Z\n---\n## 2026-10-01T11:00:00Z — resolved\nTout est rentré dans l'ordre.\n`,
)!;

describe("xmlEscape", () => {
  it("escapes markup and strips characters XML forbids", () => {
    expect(xmlEscape(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;");
    expect(xmlEscape("a\u0000b\u0008c")).toBe("abc");
  });
});

describe("Atom feed", () => {
  const entries = feedEntries(
    [incident],
    [
      { title: "Drivecord 1.0", slug: "drivecord-1-0", date: "2026-10-02", markdown: "Du **neuf**" },
      { title: "Sans date", slug: "sans-date", date: null, markdown: "x" },
    ],
    SITE,
  );

  it("lists incidents and dated news, newest first, skipping undated news", () => {
    expect(entries.map((e) => e.id)).toEqual([`${SITE}/nouveautes#drivecord-1-0`, `${SITE}/incidents/panne-envoi`]);
    expect(entries[1]!.title).toContain("Résolu");
  });

  it("is a well-formed document with escaped text", () => {
    const xml = buildAtom(SITE, entries, new Date("2026-10-03T00:00:00Z"));
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">');
    expect(xml).toContain("Panne &lt;envoi&gt; &amp; &quot;relais&quot;");
    expect(xml).not.toContain("<envoi>");
    expect((xml.match(/<entry>/g) ?? []).length).toBe(2);
    expect(xml).toContain("<updated>2026-10-02T00:00:00.000Z</updated>");
    // Every opened tag is closed.
    for (const tag of ["feed", "entry", "title", "summary", "updated", "id"]) {
      expect((xml.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length, tag).toBe((xml.match(new RegExp(`</${tag}>`, "g")) ?? []).length);
    }
  });

  it("is valid with no entries", () => {
    const xml = buildAtom(SITE, [], new Date("2026-10-03T00:00:00Z"));
    expect(xml).toContain("<updated>2026-10-03T00:00:00.000Z</updated>");
    expect(xml).not.toContain("<entry>");
  });
});

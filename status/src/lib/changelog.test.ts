import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChangelog, slugify } from "./changelog";

const SAMPLE = `# Changelog Drivecord

<!--
  Intro (jusqu'au prochain "## ").
-->

## Drivecord 1.0 : chiffrement de bout en bout et API v2

🔒 **Vrai chiffrement**
- Fichiers chiffrés.

## Continuer avec Cord (2026-08-20)

- Bouton **Cord**.

## Continuer avec Cord

- Doublon de titre.
`;

describe("parseChangelog", () => {
  it("splits sections on ## headings and drops the intro and comment", () => {
    const e = parseChangelog(SAMPLE);
    expect(e.map((x) => x.title)).toEqual(["Drivecord 1.0 : chiffrement de bout en bout et API v2", "Continuer avec Cord", "Continuer avec Cord"]);
    expect(e[0]!.markdown).toContain("Vrai chiffrement");
    expect(e[0]!.markdown).not.toContain("Intro");
  });

  it("uses a date written in the title, then falls back to the commit dates by position", () => {
    const e = parseChangelog(SAMPLE, ["2026-10-01T09:00:00Z", "2026-09-15T09:00:00Z", "2026-09-01T09:00:00Z"]);
    expect(e[0]!.date).toBe("2026-10-01");
    expect(e[1]!.date).toBe("2026-08-20"); // from the title, wins over the commit
    expect(e[2]!.date).toBe("2026-09-01");
  });

  it("never invents a date when none is known", () => {
    expect(parseChangelog("## A\n\ntexte\n\n## B\n\ntexte").every((x) => x.date === null)).toBe(true);
  });

  it("produces unique slugs", () => {
    const slugs = parseChangelog(SAMPLE).map((x) => x.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs[1]).toBe("continuer-avec-cord");
    expect(slugs[2]).toBe("continuer-avec-cord-2");
  });

  it("handles an empty document", () => {
    expect(parseChangelog("")).toEqual([]);
    expect(parseChangelog("# Titre seul")).toEqual([]);
  });

  it("parses the real changelog of the project and mentions the 1.0 highlights", () => {
    const real = readFileSync(path.join(process.cwd(), "content", "changelog.md"), "utf8");
    const e = parseChangelog(real);
    expect(e.length).toBeGreaterThan(3);
    const top = e[0]!.markdown + e[0]!.title;
    for (const needle of ["bout en bout", "API v2", "Bannière jaune", "Corbeille", "bêta est terminée"]) expect(top, needle).toContain(needle);
  });
});

describe("slugify", () => {
  it("strips accents and punctuation", () => {
    expect(slugify("Été : à l'œuvre !")).toBe("ete-a-l-uvre");
    expect(slugify("!!!")).toBe("entree");
  });
});

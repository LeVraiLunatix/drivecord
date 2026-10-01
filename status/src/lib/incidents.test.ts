import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseFrontmatter } from "./frontmatter";
import { forcedStatus, isActive, isUpcoming, loadIncidents, parseIncident, parseUpdates } from "./incidents";

const SOURCE = `---
title: "Envoi de fichiers lent"
status: monitoring
severity: partial_outage
components: [upload, download]
startedAt: 2026-10-01T10:00:00Z
resolvedAt:
summary: Les envois sont ralentis.
---
## 2026-10-01T10:00:00Z — investigating
Nous **enquêtons**.

## 2026-10-01T10:30:00Z — monitoring
Correctif déployé.

- un point
`;

describe("parseFrontmatter", () => {
  it("reads strings, quoted strings, lists and empty values", () => {
    const { data, body } = parseFrontmatter(SOURCE);
    expect(data.title).toBe("Envoi de fichiers lent");
    expect(data.components).toEqual(["upload", "download"]);
    expect(data.resolvedAt).toBeNull();
    expect(body.startsWith("## 2026-10-01")).toBe(true);
  });
  it("returns the whole text as body when there is no front matter, and tolerates CRLF", () => {
    expect(parseFrontmatter("juste du texte").data).toEqual({});
    expect(parseFrontmatter("---\r\ntitle: A\r\n---\r\ncorps").data.title).toBe("A");
  });
});

describe("parseUpdates", () => {
  it("builds a dated journal, newest first, keeping the markdown body", () => {
    const u = parseUpdates(parseFrontmatter(SOURCE).body);
    expect(u.map((x) => x.status)).toEqual(["monitoring", "investigating"]);
    expect(u[0]!.body).toContain("Correctif déployé.");
    expect(u[0]!.body).toContain("- un point");
    expect(u[1]!.body).toBe("Nous **enquêtons**.");
  });
  it("accepts a bare date and a heading without status", () => {
    const u = parseUpdates("## 2026-10-02\nTexte");
    expect(u).toHaveLength(1);
    expect(u[0]!.status).toBeNull();
    expect(Date.parse(u[0]!.at)).toBe(Date.UTC(2026, 9, 2));
  });
});

describe("parseIncident", () => {
  it("parses a complete incident", () => {
    const i = parseIncident("envoi-lent", SOURCE)!;
    expect(i).toMatchObject({ slug: "envoi-lent", status: "monitoring", severity: "partial_outage", components: ["upload", "download"], resolvedAt: null });
    expect(i.updates).toHaveLength(2);
  });
  it("defaults to all components and fills resolvedAt for a resolved incident", () => {
    const i = parseIncident("x", "---\ntitle: T\nstatus: resolved\nseverity: degraded\nstartedAt: 2026-10-01T10:00:00Z\n---\n")!;
    expect(i.components).toBe("all");
    expect(i.resolvedAt).toBe("2026-10-01T10:00:00Z");
  });
  it("rejects malformed files instead of throwing", () => {
    expect(parseIncident("x", "pas de front matter")).toBeNull();
    expect(parseIncident("x", "---\ntitle: T\nstatus: nope\nseverity: degraded\nstartedAt: 2026-10-01\n---\n")).toBeNull();
    expect(parseIncident("x", "---\ntitle: T\nstatus: resolved\nseverity: degraded\nstartedAt: pas-une-date\n---\n")).toBeNull();
  });
});

describe("forced status", () => {
  const mk = (over: string) => parseIncident("i", `---\ntitle: T\nstartedAt: 2026-10-01T10:00:00Z\n${over}\n---\n`)!;
  const NOW = Date.parse("2026-10-01T12:00:00Z");

  it("applies the severity of an active incident to its components only", () => {
    const inc = mk("status: investigating\nseverity: major_outage\ncomponents: [upload]");
    expect(forcedStatus([inc], "upload", NOW)).toBe("major_outage");
    expect(forcedStatus([inc], "docs", NOW)).toBeNull();
  });
  it("applies to every component for `all` and takes the worst of several incidents", () => {
    const a = mk("status: identified\nseverity: degraded\ncomponents: all");
    const b = mk("status: investigating\nseverity: partial_outage\ncomponents: [docs]");
    expect(forcedStatus([a, b], "docs", NOW)).toBe("partial_outage");
    expect(forcedStatus([a, b], "site", NOW)).toBe("degraded");
  });
  it("ignores resolved incidents and maintenances that have not started", () => {
    const resolved = mk("status: resolved\nseverity: major_outage\ncomponents: all");
    const future = parseIncident("m", `---\ntitle: M\nstatus: investigating\nseverity: maintenance\nstartedAt: 2026-10-05T10:00:00Z\n---\n`)!;
    expect(forcedStatus([resolved, future], "site", NOW)).toBeNull();
    expect(isActive(future, NOW)).toBe(false);
    expect(isUpcoming(future, NOW)).toBe(true);
    expect(isActive(resolved, NOW)).toBe(false);
  });
});

describe("loadIncidents", () => {
  it("loads files newest first, skips malformed and underscore files, and tolerates a missing folder", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "inc-"));
    writeFileSync(path.join(dir, "a.md"), "---\ntitle: A\nstatus: resolved\nseverity: degraded\nstartedAt: 2026-09-01T00:00:00Z\n---\n");
    writeFileSync(path.join(dir, "b.md"), "---\ntitle: B\nstatus: resolved\nseverity: degraded\nstartedAt: 2026-10-01T00:00:00Z\n---\n");
    writeFileSync(path.join(dir, "broken.md"), "rien");
    writeFileSync(path.join(dir, "_template.md"), "---\ntitle: T\nstatus: resolved\nseverity: degraded\nstartedAt: 2026-10-01T00:00:00Z\n---\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadIncidents(dir).map((i) => i.slug)).toEqual(["b", "a"]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect(loadIncidents(path.join(dir, "absent"))).toEqual([]);
  });
});

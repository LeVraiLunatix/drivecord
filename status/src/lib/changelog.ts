import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChangelogEntry } from "./types";

export const CHANGELOG_RAW_URL = "https://raw.githubusercontent.com/LeVraiLunatix/drivecord/master/CHANGELOG.md";
const COMMITS_URL = "https://api.github.com/repos/LeVraiLunatix/drivecord/commits?path=CHANGELOG.md&per_page=30";

const DATE_IN_TITLE = /\s*[(\[—–·-]*\s*(\d{4}-\d{2}-\d{2})\s*[)\]]?\s*$/;

export const slugify = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "entree";

/**
 * Splits CHANGELOG.md into entries, one per `## Title` section (the intro and the HTML comment before the
 * first section are dropped). A date in the title (`## Titre (2026-10-01)`) wins; otherwise the entry takes
 * the date of the commit at the same position in `commitDates` (newest first) — an approximation that holds
 * when each changelog commit adds one section, which is how the file is maintained.
 */
export function parseChangelog(markdown: string, commitDates: string[] = []): ChangelogEntry[] {
  const lines = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const raw: { title: string; lines: string[] }[] = [];
  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) raw.push({ title: h[1]!, lines: [] });
    else raw.at(-1)?.lines.push(line);
  }
  const seen = new Map<string, number>();
  return raw.map((r, i) => {
    const dm = DATE_IN_TITLE.exec(r.title);
    const title = (dm ? r.title.replace(DATE_IN_TITLE, "") : r.title).trim() || r.title;
    let slug = slugify(title);
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    if (n) slug = `${slug}-${n + 1}`;
    const date = dm?.[1] ?? commitDates[i]?.slice(0, 10) ?? null;
    return { title, slug, date, markdown: r.lines.join("\n").trim() };
  });
}

async function fetchText(url: string, revalidate: number, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(5000), headers: { "User-Agent": "DrivecordStatus/1", ...headers } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function fetchCommitDates(): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  const text = await fetchText(COMMITS_URL, 3600, { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  if (!text) return [];
  try {
    const list = JSON.parse(text) as { commit?: { committer?: { date?: string } } }[];
    return list.map((c) => c.commit?.committer?.date ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/** Latest changelog of the main repo, falling back to the copy shipped with the status page. */
export async function loadChangelog(): Promise<ChangelogEntry[]> {
  const [remote, dates] = await Promise.all([fetchText(CHANGELOG_RAW_URL, 600), fetchCommitDates()]);
  let md = remote;
  if (!md || !/^##\s/m.test(md)) {
    try {
      md = readFileSync(path.join(process.cwd(), "content", "changelog.md"), "utf8");
    } catch {
      md = "";
    }
  }
  return parseChangelog(md, dates);
}

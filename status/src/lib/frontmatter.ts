/**
 * Minimal front-matter reader for the incident files: `key: value` lines, quoted strings, and inline
 * lists (`[a, b]`). Deliberately tiny — no YAML engine, nothing evaluated.
 */
export type FrontValue = string | string[] | null;

export function parseFrontmatter(source: string): { data: Record<string, FrontValue>; body: string } {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, FrontValue> = {};
  for (const line of m[1]!.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    data[kv[1]!] = parseValue(kv[2]!.trim());
  }
  return { data, body: m[2]! };
}

function unquote(v: string): string {
  const q = v[0];
  if ((q === '"' || q === "'") && v.endsWith(q) && v.length >= 2) return v.slice(1, -1);
  return v;
}

function parseValue(raw: string): FrontValue {
  if (raw === "" || raw === "null" || raw === "~") return null;
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((x) => unquote(x.trim()))
      .filter(Boolean);
  }
  return unquote(raw);
}

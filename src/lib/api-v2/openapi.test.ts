import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src/app/api/v2");
const spec = JSON.parse(readFileSync(join(process.cwd(), "public/openapi-v2.json"), "utf8"));

function routes(dir: string, out: { path: string; methods: string[] }[] = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) routes(full, out);
    else if (e === "route.ts") {
      const src = readFileSync(full, "utf8");
      const methods = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) =/g)].map((m) => m[1]!.toLowerCase());
      const p = "/" + relative(ROOT, dir).split(sep).join("/").replace(/\[(\w+)\]/g, "{$1}");
      out.push({ path: p === "/." || p === "/" ? "/" : p, methods });
    }
  }
  return out;
}

describe("openapi-v2.json", () => {
  const found = routes(ROOT);
  it("documents every route and method implemented", () => {
    for (const r of found) for (const m of r.methods) expect(spec.paths[r.path]?.[m], `${m.toUpperCase()} ${r.path}`).toBeDefined();
  });
  it("documents nothing that doesn't exist", () => {
    const real = new Set(found.flatMap((r) => r.methods.map((m) => `${m} ${r.path}`)));
    for (const [p, ops] of Object.entries<Record<string, unknown>>(spec.paths)) for (const m of Object.keys(ops)) expect(real.has(`${m} ${p}`), `${m} ${p}`).toBe(true);
  });
  it("every $ref resolves", () => {
    const text = JSON.stringify(spec);
    for (const m of text.matchAll(/#\/components\/schemas\/(\w+)/g)) expect(spec.components.schemas[m[1]!], m[1]).toBeDefined();
  });
});

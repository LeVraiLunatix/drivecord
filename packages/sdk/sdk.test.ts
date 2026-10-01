import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { build } from "esbuild";

describe("@drivecord/sdk", () => {
  it("stays under 10 KB gzip with zero runtime dependencies", async () => {
    const r = await build({ entryPoints: ["packages/sdk/src/index.ts"], bundle: true, minify: true, format: "iife", write: false, target: "es2020", metafile: true, legalComments: "none" });
    const gz = gzipSync(r.outputFiles[0]!.contents).length;
    expect(gz).toBeLessThan(10 * 1024);
    const inputs = Object.keys(r.metafile!.inputs);
    expect(inputs.every((p) => !p.includes("node_modules"))).toBe(true);
  });
});

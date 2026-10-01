/** Builds dist/index.js (ESM), dist/drivecord.min.js (IIFE, `Drivecord` global) + SRI hash. Run: node packages/sdk/build.mjs */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const common = { entryPoints: [path.join(here, "src/index.ts")], bundle: true, minify: true, target: "es2020", legalComments: "none" };
fs.mkdirSync(path.join(here, "dist"), { recursive: true });
await build({ ...common, format: "esm", outfile: path.join(here, "dist/index.js") });
await build({ ...common, format: "iife", globalName: "DrivecordSDK", footer: { js: "window.Drivecord=DrivecordSDK.Drivecord;" }, outfile: path.join(here, "dist/drivecord.min.js") });
fs.writeFileSync(path.join(here, "dist/index.d.ts"), fs.readFileSync(path.join(here, "src/types.d.ts"), "utf8"));
const out = fs.readFileSync(path.join(here, "dist/drivecord.min.js"));
const sri = "sha384-" + createHash("sha384").update(out).digest("base64");
fs.writeFileSync(path.join(here, "dist/drivecord.min.js.sri"), sri + "\n");
console.log(`drivecord.min.js ${out.length} B, ${gzipSync(out).length} B gzip, ${sri}`);

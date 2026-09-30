/** Bundles the shared E2EE crypto into dist/index.js. Run: node packages/node/build.mjs */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(here, "dist"), { recursive: true });
await build({ entryPoints: [path.join(here, "src/index.ts")], bundle: true, platform: "node", format: "esm", target: "node20", outfile: path.join(here, "dist/index.js"), external: [], banner: { js: "import { createRequire as __cr } from \"node:module\"; const require = __cr(import.meta.url);" } });
fs.copyFileSync(path.join(here, "src/types.d.ts"), path.join(here, "dist/index.d.ts"));
console.log("built @drivecord/node");

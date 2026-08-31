/**
 * Builds the static, client-only "shell" of Drivecord for the Tauri desktop app.
 *
 *   node scripts/build-desktop.mjs           # build → ./out
 *   node scripts/build-desktop.mjs --restore # undo a crashed run
 *
 * How: temporarily (a) swap next.config.ts for next.config.desktop.ts,
 * (b) move every route in src/app EXCEPT the shell set into a stash,
 * (c) drop a client redirect at src/app/page.tsx, then run `next build`
 * (output: "export"). A finally block always restores the source tree, so a
 * failed build never leaves the repo mutated. Nothing here touches git.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const APP = path.join(ROOT, "src/app");
const STASH = path.join(ROOT, ".desktop-build/stash");
const CONFIG = path.join(ROOT, "next.config.ts");
const CONFIG_BAK = path.join(ROOT, ".desktop-build/next.config.ts.bak");
const CONFIG_DESKTOP = path.join(ROOT, "next.config.desktop.ts");

/** Route dirs kept in the desktop shell. Everything else in src/app is stashed. */
const KEEP_DIRS = new Set([
  "drive",
  "settings",
  "setup",
  "login",
  "register",
  "desktop-sync",
  "fonts",
]);
/** Files kept directly under src/app. */
const KEEP_FILES = new Set([
  "layout.tsx",
  "globals.css",
  "not-found.tsx",
  "icon.png",
  "apple-icon.png",
  "favicon.ico",
]);

const REDIRECT_PAGE = `"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The desktop shell has no landing page — go straight to the drive.
export default function DesktopEntry() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/drive");
  }, [router]);
  return null;
}
`;

/** Windows sometimes holds a transient lock on a dir (AV, indexer, a just-exited
 *  `next` worker) — retry the rename a few times before giving up. */
function renameWithRetry(from, to, tries = 8) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if ((e.code !== "EPERM" && e.code !== "EBUSY" && e.code !== "EACCES") || i >= tries) {
        throw e;
      }
      const until = Date.now() + 250;
      while (Date.now() < until) {
        /* tiny sync backoff */
      }
    }
  }
}

function rmWithRetry(target, tries = 8) {
  for (let i = 0; ; i++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (e) {
      if (
        (e.code !== "EPERM" &&
          e.code !== "EBUSY" &&
          e.code !== "EACCES" &&
          e.code !== "ENOTEMPTY") ||
        i >= tries
      ) {
        throw e;
      }
      const until = Date.now() + 300;
      while (Date.now() < until) {
        /* sync backoff */
      }
    }
  }
}

function moveEntry(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  renameWithRetry(from, to);
}

function restore() {
  // Move stashed routes back.
  if (fs.existsSync(STASH)) {
    for (const name of fs.readdirSync(STASH)) {
      const dest = path.join(APP, name);
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      renameWithRetry(path.join(STASH, name), dest);
    }
    fs.rmSync(STASH, { recursive: true, force: true });
  }
  // Restore next.config.ts.
  if (fs.existsSync(CONFIG_BAK)) {
    fs.rmSync(CONFIG, { force: true });
    renameWithRetry(CONFIG_BAK, CONFIG);
  }
}

if (process.argv.includes("--restore")) {
  restore();
  console.log("restored.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(CONFIG_BAK), { recursive: true });

try {
  // 1. swap config
  renameWithRetry(CONFIG, CONFIG_BAK);
  fs.copyFileSync(CONFIG_DESKTOP, CONFIG);

  // 2. stash non-shell routes
  fs.mkdirSync(STASH, { recursive: true });
  for (const entry of fs.readdirSync(APP, { withFileTypes: true })) {
    const keep = entry.isDirectory()
      ? KEEP_DIRS.has(entry.name)
      : KEEP_FILES.has(entry.name);
    if (!keep) moveEntry(path.join(APP, entry.name), path.join(STASH, entry.name));
  }

  // 3. client redirect entry page
  fs.writeFileSync(path.join(APP, "page.tsx"), REDIRECT_PAGE);

  // 4. clean this build's own artifacts (its distDir is `.next-desktop`, see
  //    next.config.desktop.ts — the main `.next` is never touched).
  rmWithRetry(path.join(ROOT, ".next-desktop"));
  rmWithRetry(path.join(ROOT, "out"));

  // 5. build
  // Invoke Next's CLI directly with `node` — avoids `.cmd`/shell quirks
  // (Node >= 20 rejects execFileSync of a .cmd without `shell: true`).
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  execFileSync(process.execPath, [nextBin, "build"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_DESKTOP: "1",
      NEXT_PUBLIC_API_BASE:
        process.env.NEXT_PUBLIC_API_BASE ?? "https://drivecord.app",
    },
  });

  console.log("\n✓ desktop shell exported to ./out");
} finally {
  restore();
}

/**
 * End-to-end run of the status page against a fake Drivecord (e2e/fake-drivecord.mjs).
 *
 *   npm run build && npm run e2e
 *
 * Layer 1 (always): drives the real production server over HTTP — probe cycles through the cron endpoint,
 *   the rendered HTML, the JSON API, the Atom feed, security headers.
 * Layer 2 (when a Chromium is found — set E2E_CHROME=/path/to/chrome, or install Playwright's browsers):
 *   opens the page in light/dark at 1280 px and 390 px for every scenario, checks there is no console error,
 *   no horizontal overflow, that the tooltip and keyboard navigation work, and saves screenshots to
 *   e2e/shots/. Without a browser this layer is skipped and says so.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPage } from "./checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = Number(process.env.E2E_FAKE_PORT ?? 3191);
const APP = Number(process.env.E2E_APP_PORT ?? 3032);
const FAKE_URL = `http://127.0.0.1:${FAKE}`;
const APP_URL = `http://127.0.0.1:${APP}`;
const SECRET = "e2e-secret";
const SHOTS = path.join(ROOT, "e2e", "shots");

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${msg}`);
  if (!cond) failures++;
};

// ── Fixture incidents, dated relative to now ──────────────────────────────────
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const HOUR = 3_600_000;
function writeIncidents(dir, { active, upcoming }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "ancien-incident.md"),
    `---\ntitle: Envoi de fichiers interrompu\nstatus: resolved\nseverity: major_outage\ncomponents: [upload]\nstartedAt: ${iso(-72 * HOUR)}\nresolvedAt: ${iso(-70 * HOUR)}\nsummary: Un relais saturé a bloqué les envois pendant deux heures.\n---\n## ${iso(-72 * HOUR)} — investigating\nLes envois échouent.\n\n## ${iso(-70 * HOUR)} — resolved\nLe relais a été redémarré, tout est revenu à la normale.\n`,
  );
  if (active)
    writeFileSync(
      path.join(dir, "incident-en-cours.md"),
      `---\ntitle: Téléchargements ralentis\nstatus: monitoring\nseverity: degraded\ncomponents: [download]\nstartedAt: ${iso(-2 * HOUR)}\nsummary: Les téléchargements sont plus lents que d'habitude.\n---\n## ${iso(-2 * HOUR)} — investigating\nNous **enquêtons**.\n\n## ${iso(-HOUR)} — monitoring\nUn correctif est déployé, nous surveillons.\n`,
    );
  if (upcoming)
    writeFileSync(
      path.join(dir, "maintenance-prevue.md"),
      `---\ntitle: Maintenance de la base de données\nstatus: investigating\nseverity: maintenance\ncomponents: all\nstartedAt: ${iso(48 * HOUR)}\nendsAt: ${iso(49 * HOUR)}\nsummary: Courte interruption prévue.\n---\n## ${iso(-HOUR)} — investigating\nUne courte interruption est prévue.\n`,
    );
}

// ── Processes ─────────────────────────────────────────────────────────────────
const procs = [];
function start(cmd, args, env, label) {
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", () => {});
  p.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(`[${label}] ${d}`));
  procs.push(p);
  return p;
}
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
}

const scenario = (name) => fetch(`${FAKE_URL}/__scenario?name=${name}`).then((r) => r.json());
/** Runs `n` probe cycles through the cron endpoint (which also regenerates the cached pages). */
async function cycle(n = 1) {
  for (let i = 0; i < n; i++) {
    const r = await fetch(`${APP_URL}/api/cron/probe`, { headers: { Authorization: `Bearer ${SECRET}` } });
    if (!r.ok) throw new Error(`cron ${r.status}`);
    await r.json();
  }
}

/** Reads what the server rendered, straight from the HTML (layer 1). */
async function htmlState() {
  const html = await (await fetch(`${APP_URL}/`)).text();
  const banner = /data-testid="global-banner" data-status="(\w+)"[^>]*>[\s\S]*?<span class="text-fg">([^<]*)</.exec(html);
  const components = {};
  for (const m of html.matchAll(/data-testid="component" data-id="([\w-]+)" data-status="(\w+)"/g)) components[m[1]] = m[2];
  return {
    html,
    banner: banner ? { status: banner[1], text: banner[2] } : null,
    components,
    maintenance: /data-testid="maintenance-message"/.test(html),
    upcoming: /data-testid="upcoming-maintenance"/.test(html),
    incidents: (html.match(/data-testid="active-incident"/g) ?? []).length,
  };
}

// ── Browser layer ─────────────────────────────────────────────────────────────
function findChrome() {
  const candidates = [
    process.env.E2E_CHROME,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((c) => c && existsSync(c));
}

async function openBrowser() {
  const exe = findChrome();
  if (!exe) return null;
  const { chromium } = await import("playwright-core");
  return chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
}

const VIEWS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const SCHEMES = ["light", "dark"];

async function browserPass(browser, label, expect) {
  mkdirSync(SHOTS, { recursive: true });
  for (const view of VIEWS) {
    for (const scheme of SCHEMES) {
      const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`${APP_URL}/`, { waitUntil: "networkidle" });
      const s = await page.evaluate(inspectPage);
      const tag = `${label} · ${view.name} · ${scheme}`;
      ok(errors.length === 0, `${tag}: no console error${errors.length ? ` (${errors[0]})` : ""}`);
      ok(!s.overflowX, `${tag}: no horizontal overflow`);
      ok(s.dark === (scheme === "dark"), `${tag}: follows the system theme`);
      expect?.(s, tag);
      if (view.name === "desktop" && scheme === "light" && label === "operational") {
        // Tooltip by hover, then keyboard.
        const bar = page.locator("[data-bar]").first();
        const box = await bar.boundingBox();
        await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
        ok(/disponibilité|pas de données/.test(await bar.locator(".tip").innerText()), `${tag}: tooltip on hover`);
        await bar.focus();
        await page.keyboard.press("ArrowLeft");
        ok((await page.locator("#bar-live").innerText()).length > 0, `${tag}: keyboard navigation announces the day`);
      }
      await page.screenshot({ path: path.join(SHOTS, `${label}-${view.name}-${scheme}.png`), fullPage: true });
      await ctx.close();
    }
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
const incDir = mkdtempSync(path.join(tmpdir(), "status-inc-"));
writeIncidents(incDir, { active: false, upcoming: false });

start(process.execPath, ["e2e/fake-drivecord.mjs", String(FAKE)], {}, "fake");
start(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(APP)],
  {
    DRIVECORD_ORIGIN: FAKE_URL,
    USERCONTENT_ORIGIN: FAKE_URL,
    CORD_ISSUER: `${FAKE_URL}/cord`,
    CORD_HUB_URL: `${FAKE_URL}/hub`,
    DESKTOP_UPDATER_URL: `${FAKE_URL}/updater/latest.json`,
    IOS_SOURCE_URL: `${FAKE_URL}/ios/source.json`,
    DISCORD_URL: `${FAKE_URL}/discord`,
    DISCORD_CDN_URL: `${FAKE_URL}/discord-cdn`,
    GOOGLE_ACCOUNTS_URL: `${FAKE_URL}/google`,
    CONTROL_URL: `${FAKE_URL}/control`,
    CRON_SECRET: SECRET,
    STATUS_INCIDENTS_DIR: incDir,
    // Make sure no real store is used by accident.
    KV_REST_API_URL: "",
    KV_REST_API_TOKEN: "",
  },
  "app",
);

let browser = null;
try {
  await waitFor(`${FAKE_URL}/__ping`);
  await waitFor(`${APP_URL}/api/health`);
  browser = await openBrowser().catch((e) => {
    console.log(`(browser layer unavailable: ${e.message.split("\n")[0]})`);
    return null;
  });
  console.log(browser ? "Browser layer: on" : "Browser layer: OFF (no Chromium found; set E2E_CHROME)");

  console.log("\n● Endpoints and headers");
  const unauth = await fetch(`${APP_URL}/api/cron/probe`);
  ok(unauth.status === 401, "cron endpoint refuses a call without the secret");
  ok((await fetch(`${APP_URL}/api/cron/probe`, { headers: { Authorization: "Bearer nope" } })).status === 401, "cron endpoint refuses a wrong secret");
  const home = await fetch(`${APP_URL}/`);
  const csp = home.headers.get("content-security-policy") ?? "";
  ok(/default-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp), "strict CSP on the page");
  ok(home.headers.get("x-content-type-options") === "nosniff" && home.headers.get("x-frame-options") === "DENY", "security headers present");
  ok((await (await fetch(`${APP_URL}/api/health`)).json()).ok === true, "own health endpoint answers");

  console.log("\n● Before any probe has run");
  // The very first visit probes by itself (no scheduler needed) — the page must not show a fake 100 %.
  await scenario("ok");
  let s = await htmlState();
  ok(s.banner !== null, "page renders");
  ok(/Historique en cours de constitution/.test(s.html), "says the history is still being built instead of showing 100 %");

  console.log("\n● Scenario: operational");
  await cycle(3);
  s = await htmlState();
  ok(s.banner?.status === "operational", `banner operational (${s.banner?.text})`);
  ok(Object.entries(s.components).every(([id, st]) => (id === "push" ? st === "unknown" : st === "operational")), "every component operational, Push honestly not verified");
  ok(Object.keys(s.components).length >= 30, `all systems listed (${Object.keys(s.components).length})`);
  if (browser) await browserPass(browser, "operational", (st, tag) => {
    ok(st.bars >= 30, `${tag}: uptime bars rendered (${st.bars})`);
    ok(st.banner?.status === "operational", `${tag}: banner operational`);
  });

  console.log("\n● Scenario: degraded (slow docs)");
  await scenario("degraded");
  await cycle(1);
  s = await htmlState();
  ok(s.components.docs === "degraded", "docs degraded");
  ok(s.banner?.status === "degraded" && /dégradé/.test(s.banner.text), `banner degraded (${s.banner?.text})`);
  if (browser) await browserPass(browser, "degraded", (st, tag) => ok(st.banner?.status === "degraded", `${tag}: banner degraded`));

  console.log("\n● Scenario: outage (escalates over cycles)");
  await scenario("outage");
  await cycle(1);
  s = await htmlState();
  ok(s.components["api-v2"] === "degraded", "1st failure: degraded");
  await cycle(1);
  s = await htmlState();
  ok(s.components["api-v2"] === "partial_outage", "2nd consecutive failure: partial outage");
  await cycle(1);
  s = await htmlState();
  ok(s.components["api-v2"] === "major_outage" && s.components["api-v1"] === "major_outage", "3rd consecutive failure: major outage");
  ok(s.banner?.status === "major_outage", `banner major outage (${s.banner?.text})`);
  if (browser) await browserPass(browser, "outage", (st, tag) => ok(st.banner?.status === "major_outage", `${tag}: banner major outage`));

  console.log("\n● Scenario: database down");
  await scenario("dbdown");
  await cycle(1);
  s = await htmlState();
  ok(s.components.db === "major_outage", "database: major outage at once");
  ok(["api-v2", "e2ee-keys", "passkeys", "drive"].every((id) => s.components[id] === "major_outage"), "DB-backed components: major outage at once");
  ok(s.components.docs === "operational", "static documentation unaffected");
  ok(s.components.upload === "major_outage" && s.components.shares === "major_outage", "components needing the database inherit the outage");
  if (browser) await browserPass(browser, "dbdown", (st, tag) => ok(st.banner?.status === "major_outage", `${tag}: banner major outage`));

  console.log("\n● Scenario: Drivecord's health endpoint missing → unknown, not an outage");
  await scenario("nohealth");
  await cycle(2);
  s = await htmlState();
  ok(["db", "discord", "email", "patreon", "push"].every((id) => s.components[id] === "unknown"), "health-derived components: not verified");
  ok(s.components.docs === "operational", "directly probed components still verified");
  ok(s.banner?.status !== "major_outage", `no false outage banner (${s.banner?.text})`);
  if (browser) await browserPass(browser, "unknown");

  console.log("\n● Scenario: maintenance message");
  await scenario("maintenance");
  await cycle(2);
  s = await htmlState();
  ok(s.components.email === "maintenance", "email in maintenance");
  ok(s.maintenance, "maintenance message displayed");
  if (browser) await browserPass(browser, "maintenance", (st, tag) => ok(/Maintenance programmée/.test(st.maintenanceMessage ?? ""), `${tag}: operators' message shown`));

  console.log("\n● Incidents: active incident and planned maintenance");
  writeIncidents(incDir, { active: true, upcoming: true });
  await scenario("ok");
  await cycle(3);
  s = await htmlState();
  ok(s.incidents === 1, "active incident listed on top");
  ok(s.upcoming, "planned maintenance announced");
  ok(s.components.download === "degraded", "active incident forces its component's status");
  const hist = await (await fetch(`${APP_URL}/history`)).text();
  ok(/Envoi de fichiers interrompu/.test(hist) && /Téléchargements ralentis/.test(hist), "history lists past and current incidents");
  const inc = await fetch(`${APP_URL}/incidents/incident-en-cours`);
  ok(inc.status === 200 && /Un correctif est déployé/.test(await inc.text()), "incident page shows the update journal");
  ok((await fetch(`${APP_URL}/incidents/n-existe-pas`)).status === 404, "unknown incident → 404");
  if (browser) await browserPass(browser, "incidents", (st, tag) => {
    ok(st.activeIncidents.length === 1, `${tag}: one active incident`);
    ok(Boolean(st.upcomingMaintenance), `${tag}: planned maintenance notice`);
  });

  console.log("\n● Public API, feed and news");
  const sum = await fetch(`${APP_URL}/api/status/summary`);
  ok(sum.headers.get("access-control-allow-origin") === "*", "summary readable cross-origin");
  const sj = await sum.json();
  ok(["none", "minor", "major", "critical", "maintenance", "unknown"].includes(sj.status.indicator), `summary indicator (${sj.status.indicator})`);
  const full = await (await fetch(`${APP_URL}/api/status`)).json();
  ok(Array.isArray(full.components) && full.components.length >= 30, "full status lists the components");
  ok(!/"fails"|probe|stack/.test(JSON.stringify(full)), "no internal detail leaks into the public API");
  ok((await fetch(`${APP_URL}/api/status`, { method: "OPTIONS" })).status === 204, "OPTIONS preflight answered");
  const feed = await fetch(`${APP_URL}/feed.xml`);
  const xml = await feed.text();
  ok(/atom\+xml/.test(feed.headers.get("content-type") ?? "") && xml.includes("<feed") && xml.includes("Téléchargements ralentis"), "Atom feed lists incidents");
  const news = await (await fetch(`${APP_URL}/nouveautes`)).text();
  ok(/bout en bout/.test(news) && /API v2/.test(news), "news page shows the 1.0 changelog");
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser?.close();
  for (const p of procs) p.kill();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

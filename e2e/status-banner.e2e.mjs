/** Status banner: hidden when healthy, yellow when the DB/Discord/site is down, maintenance message shows at once. */
import { chromium } from "playwright-core";
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${m}`); if (!c) failures++; };
const run = async (name, handler, expect, wait = 2500) => {
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  if (handler) await page.route("**/api/health", handler);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(wait);
  const banner = page.getByTestId("status-banner");
  const shown = await banner.count();
  const text = shown ? await banner.innerText() : "";
  expect(shown, text, name);
  await ctx.close();
};
const json = (body, status = 200) => (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
await run("healthy", null, (s, _t, n) => ok(!s, `${n}: no banner`));
await run("maintenance", json({ ok: false, db: true, discord: true, message: "Maintenance 22h–23h." }), (s, t, n) => ok(s && t.includes("Maintenance 22h"), `${n}: shown immediately with the message`));
await run("db down", json({ ok: false, db: false, discord: true, message: null }, 503), (s, t, n) => ok(s && /problème technique/.test(t), `${n}: yellow banner after two bad checks`), 19000);
await run("discord down", json({ ok: false, db: true, discord: false, message: null }), (s, t, n) => ok(s && /Discord/.test(t), `${n}: banner`), 19000);
await run("site unreachable", (r) => r.abort(), (s, t, n) => ok(s && /Impossible de joindre/.test(t), `${n}: banner`), 19000);
const hp = await fetch(BASE + "/api/health").then((r) => r.json());
ok(hp.db === true && typeof hp.discord === "boolean", "real /api/health reports db up");
await b.close();
console.log(failures ? `${failures} FAILURE(S)` : "ALL GOOD");
process.exit(failures ? 1 : 0);

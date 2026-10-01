/** Exploratory smoke test of /drive: runs a user journey and reports console errors, failed requests, layout overflow. */
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { chromium } from "playwright-core";
import { encode } from "next-auth/jwt";
import { createFakeDiscord } from "./fake-discord.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const SECRET = fs.readFileSync("/tmp/e2e-auth-secret", "utf8").trim();
const DB = new pg.Client({ connectionString: "postgresql://postgres@localhost:5433/drivecord" });
const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF0123456789";
const issues = [];
const note = (m) => { console.log("  ⚠", m); issues.push(m); };
const step = (s) => console.log(`\n▶ ${s}`);
const shot = (page, n) => page.screenshot({ path: `/tmp/drive-${n}.png`, fullPage: false });

await DB.connect();
await DB.query(`delete from "User" where id='u_smoke'`);
await DB.query(`insert into "User"(id,email,name,"updatedAt") values('u_smoke','smoke@example.com','Smoke',now())`);
const cookie = await encode({ token: { sub: "u_smoke", id: "u_smoke", email: "smoke@example.com", name: "Smoke", level: "full" }, secret: SECRET, salt: "authjs.session-token", maxAge: 86400 });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const discord = createFakeDiscord();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addCookies([{ name: "authjs.session-token", value: cookie, url: BASE }]);
await discord.install(ctx);
ctx.setDefaultTimeout(30000);
const page = await ctx.newPage();
page.on("pageerror", (e) => note(`pageerror: ${e.message.slice(0, 200)}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) note(`console.error: ${m.text().slice(0, 200)}`); });
page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE) && !/\/api\/(auth\/session|announcement)/.test(r.url())) note(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(BASE.length, BASE.length + 90)}`); });

try {
  step("onboarding + drive");
  await page.goto(`${BASE}/drive`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("onboarding-intro").waitFor();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByTestId("onboarding-recovery").waitFor();
  const groups = await page.locator('[data-testid="recovery-key"] > span').evaluateAll((els) => els.map((e) => e.lastChild.textContent.trim()));
  await page.getByRole("button", { name: /Je l'ai enregistrée/ }).click();
  await page.getByTestId("onboarding-verify").waitFor();
  for (const n of await page.locator('[data-testid^="verify-"]').evaluateAll((els) => els.map((e) => Number(e.dataset.testid.split("-")[1])))) await page.getByTestId(`verify-${n}`).fill(groups[n - 1]);
  await page.getByRole("button", { name: "Terminer" }).click();
  await page.getByTestId("onboarding-done").waitFor();
  await page.getByTestId("onboarding-finish").click();
  await page.waitForURL(/\/setup/);
  await page.locator("#webhook").fill(WEBHOOK);
  await page.getByRole("button", { name: /Valider & ouvrir/ }).click();
  await page.waitForURL(/\/drive/);
  await page.waitForTimeout(2500);
  await shot(page, "1-empty");

  step("new folder");
  await page.getByRole("button", { name: /Nouveau dossier|Dossier/ }).first().click();
  await page.getByRole("textbox").first().fill("Documents");
  await page.keyboard.press("Enter");
  await page.getByText(/0 élément/).first().waitFor();
  await page.getByText(/0 élément/).first().dblclick();
  await page.waitForTimeout(800);
  await shot(page, "2-folder");

  step("upload 3 files");
  for (const [name, type, body] of [["notes.txt", "text/plain", "bonjour"], ["data.json", "application/json", '{"a":1}'], ["image.png", "image/png", crypto.randomBytes(2000).toString("latin1")]]) {
    await page.evaluate(async ([name, type, body]) => {
      const input = document.querySelector('input[type="file"]:not([webkitdirectory])');
      const dt = new DataTransfer();
      dt.items.add(new File([body], name, { type }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, [name, type, body]);
    await page.waitForTimeout(1500);
  }
  await page.getByText("notes.txt").first().waitFor();
  await page.getByText("data.json").first().waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "3-files");

  step("context menu actions");
  await page.getByText("notes.txt").first().click({ button: "right" });
  await page.waitForTimeout(500);
  await shot(page, "4-menu");
  const items = await page.getByRole("menuitem").allInnerTexts();
  console.log("  menu:", items.join(" | "));
  await page.keyboard.press("Escape");

  step("preview");
  await page.getByText("notes.txt").first().dblclick();
  await page.waitForTimeout(1500);
  await shot(page, "5-preview");
  await page.keyboard.press("Escape");

  step("search / command palette");
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(500);
  await page.keyboard.type("data");
  await page.waitForTimeout(800);
  await shot(page, "6-search");
  await page.keyboard.press("Escape");

  step("mobile viewport");
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(800);
  await shot(page, "7-mobile");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) note(`horizontal overflow on mobile: ${overflow}px`);
  await page.setViewportSize({ width: 1280, height: 800 });

  step("trash flow");
  await page.getByText("data.json").first().click({ button: "right" });
  const del = page.getByRole("menuitem", { name: /Supprimer|corbeille/i }).first();
  if (await del.count()) { await del.click(); await page.getByRole("button", { name: "Mettre à la corbeille" }).click(); await page.waitForTimeout(1000); await shot(page, "8-after-delete"); } else note("no delete menu item");
  await page.waitForTimeout(800);

  step("drive-wide search from the root");
  await page.getByText("Mon drive", { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder(/Rechercher/).fill("notes");
  await page.waitForTimeout(1500);
  const found = await page.getByText("notes.txt").count();
  if (!found) note("search from the root does not find a file inside a sub-folder");
  await shot(page, "9-search");
  await page.getByPlaceholder(/Rechercher/).fill("");

  step("rename + favorite");
  await page.getByText("Documents", { exact: false }).locator("visible=true").first().click({ button: "right" }).catch(() => {});
  await page.keyboard.press("Escape");

  step("trash view");
  await page.getByRole("link", { name: "Corbeille" }).or(page.getByText("Corbeille", { exact: true })).first().click();
  await page.waitForTimeout(1200);
  await shot(page, "10-trash");
  if (!(await page.getByText("data.json").count())) note("trashed file is not listed in the trash");
  else {
    await page.getByText("data.json").first().click({ button: "right" });
    console.log("  trash menu:", (await page.getByRole("menuitem").allInnerTexts()).join(" | "));
    const restore = page.getByRole("menuitem", { name: /Restaurer/ });
    if (await restore.count()) { await restore.first().click(); await page.waitForTimeout(1000); } else note("no Restaurer in trash menu");
  }
  console.log("  trash text:", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200));
  step("rename / favorite / list view");
  await page.getByText("Tous les fichiers", { exact: true }).first().click();
  await page.getByText("Mon drive", { exact: true }).first().click();
  await page.waitForTimeout(1000);
  await page.getByText(/^\d+ éléments? ·/).first().dblclick();
  await page.getByText("notes.txt").first().waitFor();
  await page.getByText("notes.txt").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renommer" }).click();
  await page.getByRole("textbox").last().fill("notes-v2.txt");
  await page.keyboard.press("Enter");
  await page.getByText("notes-v2.txt").first().waitFor().catch(() => note("rename did not show the new name"));
  await page.waitForTimeout(1200);
  console.log("  body pointer-events:", await page.evaluate(() => document.body.style.pointerEvents + "|" + document.body.getAttribute("data-scroll-locked") + "|" + document.querySelectorAll("[data-radix-focus-guard]").length));
  const t0 = Date.now();
  const r = await Promise.race([page.evaluate(() => new Promise((res) => requestAnimationFrame(() => res("raf ok")))), new Promise((res) => setTimeout(() => res("raf BLOCKED"), 5000))]);
  console.log("  main thread:", r, Date.now() - t0, "ms");
  await shot(page, "dbg-before-rc");
  await page.getByText("notes-v2.txt").first().click({ button: "right", timeout: 8000, force: true }).catch(async (e) => { console.log("  rc fail:", e.message.split("\n").slice(0, 8).join(" ")); });
  console.log("  menu:", (await page.getByRole("menuitem").allInnerTexts()).join("|"));
  await page.getByRole("menuitem", { name: /Mettre en favori/ }).click({ timeout: 5000 });
  await page.waitForTimeout(800);
  console.log("  fav toast/state:", (await page.locator("[data-sonner-toast]").allInnerTexts()).join("|"));
  await page.getByRole("button", { name: "Favoris" }).or(page.getByRole("link", { name: "Favoris" })).first().click();
  await page.waitForTimeout(1200);
  if (!(await page.getByText("notes-v2.txt").count())) note("favorite not listed in Favoris");
  await shot(page, "11-favorites");
  await page.getByText("Tous les fichiers", { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByLabel(/liste/i).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, "12-list");

  step("other pages");
  for (const [path, name] of [["/settings", "settings"], ["/stats", "stats"], ["/shares", "shares"], ["/backup", "backup"], ["/install", "install"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await shot(page, `p-${name}`);
  }
  step("light theme + landing");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${BASE}/drive`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await shot(page, "13-light");
  const anon = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const lp = await anon.newPage();
  await lp.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await lp.waitForTimeout(2500);
  await lp.screenshot({ path: "/tmp/drive-landing.png" });
  console.log("  body text sample:", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
} catch (e) {
  note(`ABORT: ${e.message.split("\n")[0]}`);
  await shot(page, "abort").catch(() => {});
} finally {
  await browser.close(); await DB.end();
}
console.log(`\n${issues.length} issue(s)`);

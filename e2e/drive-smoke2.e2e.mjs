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
const shot = (page, n) => page.screenshot({ path: `/tmp/d2-${n}.png`, fullPage: false });

await DB.connect();
await DB.query(`delete from "User" where id='u_smoke2'`);
await DB.query(`insert into "User"(id,email,name,"updatedAt") values('u_smoke2','smoke2@example.com','Smoke',now())`);
const cookie = await encode({ token: { sub: "u_smoke2", id: "u_smoke2", email: "smoke2@example.com", name: "Smoke", level: "full" }, secret: SECRET, salt: "authjs.session-token", maxAge: 86400 });
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

  step("upload 12 files at once");
  await page.evaluate(async () => {
    const input = document.querySelector('input[type="file"]:not([webkitdirectory])');
    const dt = new DataTransfer();
    for (let i = 0; i < 12; i++) dt.items.add(new File([`contenu ${i}`], `fichier-${String(i).padStart(2, "0")}.txt`, { type: "text/plain" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByText(/Uploads terminés \(12\)/).waitFor({ timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot(page, "1-many");

  step("image thumbnail (encrypted file)");
  await page.evaluate(async () => {
    const bin = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const input = document.querySelector('input[type="file"]:not([webkitdirectory])');
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "pixel.png", { type: "image/png" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByText("pixel.png").first().waitFor();
  await page.waitForTimeout(4000);
  const thumbs = await page.locator('img[src^="data:image"]').count();
  if (!thumbs) note("no thumbnail rendered for an encrypted image");
  await shot(page, "1b-thumb");

  step("select mode + bulk");
  await page.getByRole("button", { name: /Sélectionner/ }).click();
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(600);
  await shot(page, "2-selected");
  console.log("  body:", (await page.locator("body").innerText()).replace(/\s+/g, " ").match(/\d+ sélectionn[^ ]*/)?.[0] ?? "no selection counter");

  step("keyboard: Delete on selection");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(1000);
  await shot(page, "3-bulk-dialog");
  const dlg = await page.getByRole("alertdialog").innerText().catch(() => "");
  console.log("  dialog:", dlg.replace(/\s+/g, " ").slice(0, 200));
  await page.keyboard.press("Escape");

  step("new folder + drag a file into it");
  await page.getByRole("button", { name: /Nouveau dossier/ }).first().click();
  await page.getByRole("textbox").first().fill("Rangement");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  const file = page.getByText("fichier-00.txt").first();
  const folder = page.getByText("Rangement", { exact: true }).last();
  await file.dragTo(folder).catch((e) => note("drag failed: " + e.message.split("\n")[0]));
  await page.waitForTimeout(1500);
  if (await page.getByText("fichier-00.txt").count()) note("file still at root after dragging into folder");
  await shot(page, "4-after-drag");

  step("move dialog");
  await page.getByText("fichier-01.txt").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /Déplacer/ }).click();
  await page.waitForTimeout(800);
  await shot(page, "5-move");
  await page.keyboard.press("Escape");

  step("list view sorting");
  await page.getByRole("button", { name: /Liste|list/i }).first().click().catch(() => note("no list-view button by name"));
  await page.waitForTimeout(800);
  await shot(page, "6-list");

  step("mobile");
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(800);
  await page.getByRole("button").first().click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "7-mobile-menu");
} catch (e) {
  note(`ABORT: ${e.message.split("\n")[0]}`);
  await shot(page, "abort").catch(() => {});
} finally {
  await browser.close(); await DB.end();
}
console.log(`\n${issues.length} issue(s)`);

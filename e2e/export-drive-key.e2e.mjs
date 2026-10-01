/**
 * Browser end-to-end test of Réglages › Sécurité › Chiffrement de bout en bout › « Exporter la clé ».
 * The exported key is checked against the real @drivecord/node client: it must decrypt the name of a file
 * uploaded from the web app. Needs `e2e/infra.sh up` running and `node packages/node/build.mjs`.
 * Run: node e2e/export-drive-key.e2e.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright-core";
import { encode } from "next-auth/jwt";
import { createFakeDiscord } from "./fake-discord.mjs";
import { DrivecordNode } from "../packages/node/dist/index.js";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const SECRET = fs.readFileSync("/tmp/e2e-auth-secret", "utf8").trim();
const DB = new pg.Client({ connectionString: "postgresql://postgres@localhost:5433/drivecord" });
const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF0123456789";
const TIMEOUT = 90_000;
const USER = "u_export";
const FILE_NAME = "rapport-secret-é.bin";

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${msg}`);
  if (!cond) failures++;
};
const step = (s) => console.log(`\n▶ ${s}`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
await DB.connect();
await DB.query(`delete from "User" where id=$1`, [USER]);
await DB.query(`insert into "User"(id,email,name,"updatedAt") values($1,'export@example.com','Export',now())`, [USER]);
const cookie = await encode({ token: { sub: USER, id: USER, email: "export@example.com", name: "Export", level: "full" }, secret: SECRET, salt: "authjs.session-token", maxAge: 86400 });
const discord = createFakeDiscord();

const plain = crypto.randomBytes(50_000);
const plainPath = path.join(os.tmpdir(), FILE_NAME);
fs.writeFileSync(plainPath, plain);

try {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addCookies([{ name: "authjs.session-token", value: cookie, url: BASE }]);
  await discord.install(ctx);
  ctx.setDefaultTimeout(TIMEOUT);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

  // ── A. an account with an encrypted drive and one file ────────────────────────
  step("A. onboarding, drive and file");
  await page.goto(`${BASE}/drive`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("onboarding-intro").waitFor();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByTestId("onboarding-recovery").waitFor();
  const groups = await page.locator('[data-testid="recovery-key"] > span').evaluateAll((els) => els.map((e) => e.lastChild.textContent.trim()));
  await page.getByRole("button", { name: /Je l'ai enregistrée/ }).click();
  await page.getByTestId("onboarding-verify").waitFor();
  const labels = await page.locator('[data-testid^="verify-"]').evaluateAll((els) => els.map((e) => Number(e.dataset.testid.split("-")[1])));
  for (const n of labels) await page.getByTestId(`verify-${n}`).fill(groups[n - 1]);
  await page.getByRole("button", { name: "Terminer" }).click();
  await page.getByTestId("onboarding-done").waitFor();
  await page.getByTestId("onboarding-finish").click();
  await page.waitForURL(/\/setup/);
  await page.locator("#webhook").fill(WEBHOOK);
  await page.getByRole("button", { name: /Valider & ouvrir/ }).click();
  await page.waitForURL(/\/drive/);
  await page.getByRole("button", { name: "Envoyer des fichiers" }).waitFor();
  for (let attempt = 0; attempt < 6 && discord.log.length === 0; attempt++) {
    await page.waitForTimeout(1500);
    const bytes = [...plain];
    await page.evaluate(async ([arr, name]) => {
      const input = document.querySelector('input[type="file"]:not([webkitdirectory])');
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(arr)], name, { type: "application/octet-stream" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, [bytes, FILE_NAME]);
    await page.waitForTimeout(4000);
  }
  await page.getByText(FILE_NAME).first().waitFor();
  const drive = (await DB.query(`select "driveId", name from "Webhook" where "userId"=$1`, [USER])).rows[0];
  ok(Boolean(drive), `drive created (${drive?.name})`);

  // ── B. the button in Réglages › Chiffrement ───────────────────────────────────
  step("B. export from the settings page");
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByText("Sécurité", { exact: true }).first().click();
  await page.getByTestId("encryption-settings").waitFor();
  const exportButton = page.getByRole("button", { name: "Exporter la clé" });
  ok((await exportButton.count()) === 1, "one « Exporter la clé » button, on the encrypted drive");

  page.once("dialog", (d) => d.dismiss());
  await exportButton.click();
  await page.waitForTimeout(500);
  ok((await page.getByTestId("exported-drive-key").count()) === 0, "declining the confirmation shows nothing");

  let message = "";
  page.once("dialog", (d) => { message = d.message(); void d.accept(); });
  await exportButton.click();
  const panel = page.getByTestId("exported-drive-key");
  await panel.waitFor();
  ok(/déchiffre tous les fichiers/.test(message), "a warning is shown before revealing the key");
  const keyHex = ((await panel.locator("code").first().textContent()) ?? "").trim();
  ok(/^[0-9a-f]{64}$/.test(keyHex), "the key is 64 lowercase hex characters");
  ok((await panel.textContent())?.includes(drive.name), "the panel names the drive");
  ok(!keyHex.includes("-") && groups.join("") !== keyHex, "it is not the recovery key");

  await page.getByRole("button", { name: "Copier la clé" }).click();
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => navigator.clipboard.readText())) === keyHex, "« Copier » puts the key in the clipboard");

  await page.getByRole("button", { name: "Masquer" }).click();
  ok((await panel.count()) === 0, "« Masquer » hides the key");

  // ── C. the exported key really is the drive key ───────────────────────────────
  step("C. the exported key decrypts the drive with @drivecord/node");
  const res = await fetch(`${BASE}/api/settings/personal-tokens`, {
    method: "POST",
    headers: { cookie: `authjs.session-token=${cookie}`, "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ driveId: drive.driveId, name: "export-test", scopes: ["drive:read", "drive:write", "drive:delete"] }),
  });
  const { token } = await res.json();
  ok(typeof token === "string" && token.startsWith("dvc_pat_"), "personal token created");

  const good = new DrivecordNode({ token, driveKey: Buffer.from(keyHex, "hex"), baseUrl: BASE });
  const listed = (await good.list()).files;
  ok(listed.length === 1 && listed[0].name === FILE_NAME, `the exported key decrypts the file name written by the web app (« ${listed[0]?.name} »)`);
  // The web app's file lives in the browser-side Discord fake, which the server cannot read: round-trip a new one.
  const fromServer = crypto.randomBytes(20_000);
  const { fileId } = await good.upload({ name: "depuis-le-serveur.bin", type: "application/octet-stream", data: fromServer });
  const back = await good.download(fileId);
  ok(back.name === "depuis-le-serveur.bin" && Buffer.from(back.data).equals(fromServer), "…and the key is enough to upload then download a file from a server, byte for byte");

  const wrong = new DrivecordNode({ token, driveKey: crypto.randomBytes(32), baseUrl: BASE });
  ok((await wrong.list()).files.every((f) => f.name === null), "a different key cannot read any name");

  // ── D. the key does not stay on screen ────────────────────────────────────────
  step("D. automatic hiding");
  let hidden = false;
  try {
    await page.clock.install();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Exporter la clé" }).click();
    await panel.waitFor();
    await page.clock.fastForward(61_000);
    await panel.waitFor({ state: "detached", timeout: 5000 });
    hidden = true;
  } catch (e) {
    console.log("  (clock check failed:", e.message.split("\n")[0], ")");
  }
  ok(hidden, "the key hides itself after a minute");
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  await DB.end();
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);

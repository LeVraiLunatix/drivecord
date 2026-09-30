/**
 * Browser end-to-end test of the whole E2EE experience (phase 2).
 * Needs: `e2e/infra.sh up` running (Postgres + Next dev server). Run: node e2e/e2ee.e2e.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright-core";
import { encode } from "next-auth/jwt";
import { createFakeDiscord } from "./fake-discord.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const SECRET = fs.readFileSync("/tmp/e2e-auth-secret", "utf8").trim();
const DB = new pg.Client({ connectionString: "postgresql://postgres@localhost:5433/drivecord" });
const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF0123456789";
const TIMEOUT = 90_000;

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${msg}`);
  if (!cond) failures++;
};
const step = (s) => console.log(`\n▶ ${s}`);

async function mintSession(userId, email) {
  const salt = "authjs.session-token";
  return encode({ token: { sub: userId, id: userId, email, name: "E2E", level: "full" }, secret: SECRET, salt, maxAge: 86400 });
}

async function newContext(browser, discord, cookie, opts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...opts });
  if (cookie) await ctx.addCookies([{ name: "authjs.session-token", value: cookie, url: BASE }]);
  await discord.install(ctx);
  ctx.setDefaultTimeout(TIMEOUT);
  return ctx;
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
await DB.connect();
// Repeatable runs: start from a clean account.
await DB.query(`delete from "User" where id='u_e2e'`);
await DB.query(`insert into "User"(id,email,name,"updatedAt") values('u_e2e','e2e@example.com','E2E',now()) on conflict do nothing`);
const cookie = await mintSession("u_e2e", "e2e@example.com");
const discord = createFakeDiscord();

const plain = crypto.randomBytes(300_000); // not a multiple of anything; one chunk
const plainPath = path.join(os.tmpdir(), "rapport-secret-é.bin");
fs.writeFileSync(plainPath, plain);

try {
  // ── A. first visit: onboarding ────────────────────────────────────────────────
  step("A. onboarding (first visit)");
  const ctx1 = await newContext(browser, discord, cookie);
  const page = await ctx1.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/DevTools|HMR|Fast Refresh|Password field/.test(m.text())) console.log("  [console.error]", m.text().slice(0, 300)); });
  page.on("requestfailed", (r) => console.log("  [requestfailed]", r.method(), r.url().slice(0, 120), r.failure()?.errorText));
  page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/")) console.log("  [http", r.status() + "]", r.url().slice(0, 140)); });
  await page.goto(`${BASE}/drive`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("onboarding-intro").waitFor();
  ok(true, "onboarding shown for an account without keys");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByTestId("onboarding-recovery").waitFor();
  const groups = await page.locator('[data-testid="recovery-key"] > span').evaluateAll((els) => els.map((e) => e.lastChild.textContent.trim()));
  ok(groups.length === 13, `recovery key displayed as 13 groups (${groups.length})`);
  const rows = await DB.query(`select count(*)::int as n from "UserKeys" where "userId"='u_e2e'`);
  ok(rows.rows[0].n === 0, "nothing stored yet (keys only committed after the user proves they saved the recovery key)");
  await page.getByRole("button", { name: /Je l'ai enregistrée/ }).click();
  await page.getByTestId("onboarding-verify").waitFor();

  // wrong answer first
  const labels = await page.locator('[data-testid^="verify-"]').evaluateAll((els) => els.map((e) => Number(e.dataset.testid.split("-")[1])));
  for (const n of labels) await page.getByTestId(`verify-${n}`).fill("AAAA");
  await page.getByRole("button", { name: "Terminer" }).click();
  await page.getByText("ne correspondent pas").waitFor();
  ok(true, "wrong recovery groups are refused");
  for (const n of labels) await page.getByTestId(`verify-${n}`).fill(groups[n - 1]);
  await page.getByRole("button", { name: "Terminer" }).click();
  await page.getByTestId("onboarding-done").waitFor();
  const stored = (await DB.query(`select * from "UserKeys" where "userId"='u_e2e'`)).rows[0];
  ok(Boolean(stored?.mkWrappedRecovery?.startsWith("v1.")), "wrapped keys stored after verification");
  ok(stored.mkWrappedPhrase === null, "no passphrase chosen");
  const recoveryKey = groups.join("-");
  await page.getByTestId("onboarding-finish").click();

  // ── B. add a drive, upload a file ─────────────────────────────────────────────
  step("B. add a drive + upload");
  await page.waitForURL(/\/setup/);
  await page.locator("#webhook").fill(WEBHOOK);
  await page.getByRole("button", { name: /Valider & ouvrir/ }).click();
  await page.waitForURL(/\/drive/);
  const wh = (await DB.query(`select "dkWrapped","e2eeVersion","encKey" from "Webhook" where "userId"='u_e2e'`)).rows[0];
  ok(wh?.e2eeVersion === 1 && wh.dkWrapped?.startsWith("v1."), "drive created with a wrapped drive key (e2eeVersion 1)");
  ok(wh.encKey === null, "server holds NO drive key");

  await page.getByRole("button", { name: "Upload" }).first().waitFor();
  // Dev-mode HMR may re-mount the page right after navigation and swallow an early `change`: retry until the upload starts.
  for (let attempt = 0; attempt < 6 && discord.log.length === 0; attempt++) {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
    await page.setInputFiles('input[type="file"] >> nth=0', plainPath);
    await page.waitForTimeout(4000);
  }
  await page.getByText("rapport-secret-é.bin").first().waitFor();
  ok(true, "file appears in the list with its real (decrypted) name");

  const f = (await DB.query(`select * from "DriveFile" where "webhookId" = (select id from "Webhook" where "userId"='u_e2e')`)).rows[0];
  ok(f.filename === "" && f.mimeType === "application/octet-stream", "server row has no filename / type");
  ok(f.cryptoVersion === 1 && f.fkWrapped?.startsWith("v1.") && f.encMeta?.startsWith("v1.") && f.noncePrefix, "v1 crypto fields stored");
  ok(!JSON.stringify(f).includes("rapport-secret"), "the real name appears nowhere in the row");
  ok(Number(f.size) === plain.length + 16, `stored size = plaintext + 16-byte tag (${f.size})`);
  const uploaded = discord.log.at(-1);
  ok(!uploaded.filename.includes("rapport") && uploaded.filename.startsWith(f.id), `Discord attachment is named after the opaque id (${uploaded.filename})`);
  const stash = [...discord.attachments.values()].at(-1).buf;
  ok(stash.length === plain.length + 16 && !stash.includes(plain.subarray(1000, 1064)), "Discord holds ciphertext only");

  // ── C. reload: trusted device unlocks silently ───────────────────────────────
  step("C. reload (trusted device)");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("rapport-secret-é.bin").first().waitFor();
  ok(true, "silent unlock on a trusted device, name decrypted");

  // ── D. download round trip ────────────────────────────────────────────────────
  step("D. download");
  await page.getByText("rapport-secret-é.bin").first().click({ button: "right" }).catch(() => {});
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      const item = page.getByRole("menuitem", { name: "Télécharger" });
      if (await item.count()) await item.first().click();
      else await page.getByText("rapport-secret-é.bin").first().dblclick();
    })(),
  ]);
  const dlPath = await download.path();
  const got = fs.readFileSync(dlPath);
  ok(download.suggestedFilename() === "rapport-secret-é.bin", `downloaded file keeps its name (${download.suggestedFilename()})`);
  ok(Buffer.compare(got, plain) === 0, "downloaded bytes == original (decrypted in the browser)");

  // ── E. a fresh browser: unlock with the recovery key ─────────────────────────
  step("E. new device, recovery key");
  const ctx2 = await newContext(browser, discord, cookie);
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/drive`, { waitUntil: "domcontentloaded" });
  await p2.getByTestId("unlock-screen").waitFor();
  ok(true, "unlock screen on an untrusted device");
  await p2.getByTestId("unlock-recovery-btn").click();
  await p2.getByTestId("unlock-input").fill("AAAA-AAAA-AAAA");
  await p2.getByTestId("unlock-submit").click();
  await p2.getByTestId("unlock-error").waitFor();
  ok(true, "wrong recovery key → clean error");
  await p2.getByTestId("unlock-input").fill(recoveryKey);
  await p2.getByTestId("unlock-submit").click();
  await p2.getByText("rapport-secret-é.bin").first().waitFor();
  ok(true, "recovery key unlocks and the drive shows decrypted names");

  // ── F. device approval with SAS ───────────────────────────────────────────────
  step("F. approve a new device (SAS)");
  const ctx3 = await newContext(browser, discord, cookie);
  const p3 = await ctx3.newPage();
  await p3.goto(`${BASE}/drive`, { waitUntil: "domcontentloaded" });
  await p3.getByTestId("unlock-device-btn").click();
  await page.getByTestId("review-transfer").waitFor({ timeout: 30_000 });
  await page.getByTestId("review-transfer").click();
  const codeApprover = await page.getByTestId("approver-sas-code").innerText();
  const codeNew = await p3.getByTestId("sas-code").innerText();
  ok(/^\d{6}$/.test(codeApprover) && codeApprover === codeNew, `both screens show the same 6-digit code (${codeApprover})`);
  const mid = (await DB.query(`select "sealedMk","status" from "KeyTransferRequest" where "userId"='u_e2e' order by "createdAt" desc limit 1`)).rows[0];
  ok(mid.sealedMk === null && mid.status === "pending", "nothing sealed before the user confirms the codes");
  await page.getByTestId("approve-transfer").click();
  await p3.getByText("rapport-secret-é.bin").first().waitFor({ timeout: 30_000 });
  ok(true, "new device unlocked via approval");

  // ── G. shares: #k= link and password link ─────────────────────────────────────
  step("G. share link with the key in the fragment");
  await page.getByText("rapport-secret-é.bin").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /Partager par lien/ }).click();
  await page.getByRole("button", { name: "Créer le lien" }).click();
  const linkEl = page.locator("code").filter({ hasText: "/s/" }).first();
  await linkEl.waitFor();
  const link = (await linkEl.innerText()).trim();
  ok(/\/s\/[A-Za-z0-9_-]{24}#k=[A-Za-z0-9_-]{43}$/.test(link), `link carries a 256-bit key in the fragment (${link.replace(/#k=.*/, "#k=…")})`);
  const share = (await DB.query(`select * from "Share" order by "createdAt" desc limit 1`)).rows[0];
  ok(!JSON.stringify(share).includes(link.split("#k=")[1]), "the key is not stored server-side");

  const anon = await newContext(browser, discord, null);
  const pa = await anon.newPage();
  await pa.goto(link, { waitUntil: "domcontentloaded" });
  await pa.getByTestId("share-filename").filter({ hasText: "rapport-secret-é.bin" }).waitFor();
  ok(true, "anonymous visitor sees the decrypted name (key from the fragment)");
  const [shared] = await Promise.all([pa.waitForEvent("download"), pa.getByTestId("share-download").click()]);
  ok(Buffer.compare(fs.readFileSync(await shared.path()), plain) === 0, "shared download decrypts in the visitor's browser");

  const noKey = await anon.newPage();
  await noKey.goto(link.split("#k=")[0], { waitUntil: "domcontentloaded" });
  await noKey.getByText("incomplet").waitFor();
  ok(true, "link without the fragment is unusable (server can't decrypt)");

  // password share
  await page.getByRole("button", { name: /Révoquer/ }).click();
  await page.getByLabel("Mot de passe (optionnel)").fill("un mot de passe solide");
  await page.getByRole("button", { name: "Créer le lien" }).click();
  await page.getByText("Protégé par mot de passe").waitFor();
  const pwShare = (await DB.query(`select * from "Share" order by "createdAt" desc limit 1`)).rows[0];
  ok(pwShare.passwordHash === null && pwShare.fkWrappedForShare?.startsWith("v1."), "password share: no bcrypt on the server, key wrapped by Argon2id(password)");
  const pwLink = `${BASE}/s/${pwShare.token}`;
  const pw = await anon.newPage();
  await pw.goto(pwLink, { waitUntil: "domcontentloaded" });
  await pw.getByTestId("share-password").fill("mauvais mot de passe");
  await pw.getByRole("button", { name: "Déverrouiller" }).click();
  await pw.getByText("Mot de passe incorrect").waitFor();
  ok(true, "wrong share password refused (by failed unwrapping, not by the server)");
  await pw.getByTestId("share-password").fill("un mot de passe solide");
  await pw.getByRole("button", { name: "Déverrouiller" }).click();
  await pw.getByTestId("share-filename").filter({ hasText: "rapport-secret-é.bin" }).waitFor();
  const [shared2] = await Promise.all([pw.waitForEvent("download"), pw.getByTestId("share-download").click()]);
  ok(Buffer.compare(fs.readFileSync(await shared2.path()), plain) === 0, "password share downloads and decrypts");

  // ── H. server never sees the PIN ──────────────────────────────────────────────
  step("H. vault PIN stays on the device");
  const pinRequests = [];
  page.on("request", (r) => { if (r.url().includes("/api/account/vault-pin") && r.method() !== "GET") pinRequests.push(r.postData() ?? ""); });
  await page.goto(`${BASE}/drive`, { waitUntil: "domcontentloaded" });
  await page.getByText("rapport-secret-é.bin").first().waitFor();
  await page.getByRole("button", { name: /Coffre/ }).first().click();
  await page.locator("#pin").fill("424242");
  await page.locator("#confirm-pin").fill("424242");
  await page.getByRole("button", { name: "Créer le coffre" }).click();
  await page.getByText("Coffre-fort créé").waitFor();
  const u = (await DB.query(`select "vaultKdf","vaultPin","vaultKeyWrapped" from "User" where id='u_e2e'`)).rows[0];
  ok(u.vaultKdf?.alg === "argon2id" && u.vaultKeyWrapped?.startsWith("v1."), "vault v2: Argon2id parameters + wrapped key");
  ok(pinRequests.length > 0 && pinRequests.every((b) => !b.includes("424242")), "the PIN is never sent to the server (only a verifier)");
  const uk = (await DB.query(`select "vaultKeyWrapped" from "UserKeys" where "userId"='u_e2e'`)).rows[0];
  ok(uk.vaultKeyWrapped?.startsWith("v1."), "vault key also wrapped under the Master Key");
} catch (err) {
  failures++;
  console.error("\n✗ test aborted:", err.message);
  try {
    const pages = browser.contexts().flatMap((c) => c.pages());
    for (const [i, p] of pages.entries()) await p.screenshot({ path: `/tmp/e2e-fail-${i}.png` }).catch(() => {});
    console.error(`  screenshots: /tmp/e2e-fail-*.png (${pages.length})`);
    console.error("  urls:", pages.map((p) => p.url()));
  } catch {}
} finally {
  await browser.close();
  await DB.end();
}

console.log(failures === 0 ? "\n✅ all E2E checks passed" : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

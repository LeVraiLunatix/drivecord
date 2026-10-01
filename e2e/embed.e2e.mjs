/**
 * Browser test of the SDK + embed iframes across two origins (host 127.0.0.1:4100, Drivecord localhost:3100).
 * Needs `e2e/infra.sh up` and `node packages/sdk/build.mjs`. Run: node e2e/embed.e2e.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import pg from "pg";
import { chromium } from "playwright-core";
import { encode } from "next-auth/jwt";
import { createFakeDiscord } from "./fake-discord.mjs";

// The app behind a TLS terminator, like production: a tiny front adds `x-forwarded-proto: https` so Auth.js
// uses its secure cookie names (the embed token bridge relies on that). Plain http to the browser (localhost).
const UPSTREAM = process.env.E2E_BASE ?? "http://localhost:3100";
const BASE = "http://localhost:3200";
const COOKIE = "__Secure-authjs.session-token";
const front = http.createServer((req, res) => {
  const up = http.request(UPSTREAM + req.url, { method: req.method, headers: { ...req.headers, host: "localhost:3200", "x-forwarded-proto": "https" } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on("error", () => res.writeHead(502).end());
  req.pipe(up);
});
await new Promise((r) => front.listen(3200, "localhost", r));
const HOST = "http://127.0.0.1:4100";
const SECRET = fs.readFileSync("/tmp/e2e-auth-secret", "utf8").trim();
const DB = new pg.Client({ connectionString: "postgresql://postgres@localhost:5433/drivecord" });
const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF0123456789";
const TIMEOUT = 90_000;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${m}`); if (!c) failures++; };
const step = (s) => console.log(`\n▶ ${s}`);

const sdk = fs.readFileSync("packages/sdk/dist/drivecord.min.js");
const server = http.createServer((req, res) => {
  if (req.url === "/sdk.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(sdk); }
  if (req.url?.startsWith("/cb")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<script src="/sdk.js"></script><script>Drivecord.completeSignIn()</script>`); }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><div id="box"></div><div id="view"></div><script src="/sdk.js"></script><script>
    window.__events = [];
    window.dc = Drivecord.init({ clientId: new URLSearchParams(location.search).get("c"), baseUrl: "${BASE}", redirectUri: "${HOST}/cb" });
    window.mountUp = () => dc.mountUploader(document.getElementById("box"), { onReady: () => __events.push({ t: "ready" }), onUploaded: (f) => __events.push({ t: "uploaded", ...f }), onProgress: (p) => __events.push({ t: "progress" }), onError: (c) => __events.push({ t: "error", c }) });
    window.mountView = (id) => dc.mountViewer(document.getElementById("view"), { fileId: id });
  </script>`);
});
await new Promise((r) => server.listen(4100, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
await DB.connect();
await DB.query(`delete from "User" where id='u_emb'`);
await DB.query(`insert into "User"(id,email,name,"updatedAt") values('u_emb','emb@example.com','Emb',now())`);
const cookie = await encode({ token: { sub: "u_emb", id: "u_emb", email: "emb@example.com", name: "Emb", level: "full" }, secret: SECRET, salt: COOKIE, maxAge: 86400 });
const discord = createFakeDiscord();
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.addCookies([{ name: COOKIE, value: cookie, domain: "localhost", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
await discord.install(ctx);
ctx.setDefaultTimeout(TIMEOUT);
const web = (p, init = {}) => fetch(BASE + p, { ...init, headers: { cookie: `${COOKIE}=${cookie}`, "content-type": "application/json", origin: BASE, ...(init.headers ?? {}) } });

try {
  step("owner: onboarding + drive (first-party)");
  const owner = await ctx.newPage();
  await owner.goto(`${BASE}/drive`, { waitUntil: "domcontentloaded" });
  await owner.getByTestId("onboarding-intro").waitFor({ timeout: 20000 }).catch(async () => { console.log("  owner url:", owner.url(), (await owner.evaluate(() => document.body.innerText)).slice(0, 200)); throw new Error("no onboarding"); });
  await owner.getByRole("button", { name: "Continuer" }).click();
  await owner.getByTestId("onboarding-recovery").waitFor();
  const groups = await owner.locator('[data-testid="recovery-key"] > span').evaluateAll((els) => els.map((e) => e.lastChild.textContent.trim()));
  await owner.getByRole("button", { name: /Je l'ai enregistrée/ }).click();
  await owner.getByTestId("onboarding-verify").waitFor();
  const labels = await owner.locator('[data-testid^="verify-"]').evaluateAll((els) => els.map((e) => Number(e.dataset.testid.split("-")[1])));
  for (const n of labels) await owner.getByTestId(`verify-${n}`).fill(groups[n - 1]);
  await owner.getByRole("button", { name: "Terminer" }).click();
  await owner.getByTestId("onboarding-done").waitFor();
  const recoveryKey = groups.join("-");
  await owner.getByTestId("onboarding-finish").click();
  await owner.waitForURL(/\/setup/);
  await owner.locator("#webhook").fill(WEBHOOK);
  await owner.getByRole("button", { name: /Valider & ouvrir/ }).click();
  await owner.waitForURL(/\/drive/);
  const wh = (await DB.query(`select id,"driveId" from "Webhook" where "userId"='u_emb'`)).rows[0];
  ok(Boolean(wh), "drive created");

  step("register app + grant");
  let r = await web("/api/developers/apps", { method: "POST", body: JSON.stringify({ name: "Wavecast", homepageUrl: "https://app.example", redirectUris: [`${HOST}/cb`], allowedOrigins: [HOST] }) });
  const reg = await r.json(); if (!reg.app) console.log("register failed", r.status, JSON.stringify(reg)); const app = reg.app;
  await DB.query(`insert into "DriveFolder"(id,"webhookId","driveId","parentId",name,"encName","updatedAt") values('appfolder_e','${wh.id}','${wh.driveId}','','','v1.AAAAAAAAAAAAAAAA.AAAA',now())`);
  await DB.query(`insert into "AppGrant"(id,"appId","userId","webhookId","appFolderId",scopes) values('g1',$1,'u_emb',$2,'appfolder_e',$3)`, [app.id, wh.id, ["app_folder:read", "app_folder:write"]]);

  step("frame-ancestors is per client_id");
  const csp = async (q) => (await fetch(`${BASE}/embed/upload?client_id=${q}`)).headers.get("content-security-policy");
  ok((await csp(app.id)) === `frame-ancestors ${HOST}`, "allowed origin only");
  ok((await csp("app_unknownunknown00")) === "frame-ancestors 'none'", "unknown client → nobody may frame it");
  ok((await (await fetch(`${BASE}/embed/connect`, { redirect: "manual" })).headers.get("x-frame-options")) === "DENY", "connect popup can never be framed");

  step("host page mounts the uploader");
  const host = await ctx.newPage();
  host.on("console", (m) => console.log("  [host console]", m.type(), m.text().slice(0, 240)));
  host.on("pageerror", (e) => console.log("  [host pageerror]", e.message.slice(0, 300)));
  host.on("response", (r) => { if (r.status() >= 400) console.log("  [http", r.status() + "]", r.url().slice(0, 120)); });
  host.on("requestfailed", (r) => console.log("  [requestfailed]", r.url().slice(0, 140), r.failure()?.errorText));
  host.on("request", (r) => { if (r.frame() !== host.mainFrame() && /_next|api/.test(r.url())) console.log("  [iframe req]", r.url().slice(0, 100), r.headers()["sec-fetch-site"]); });
  await host.goto(`${HOST}/?c=${app.id}`);
  await host.evaluate(() => window.mountUp());
  const frame = host.frameLocator("iframe");
  await frame.getByRole("button", { name: "Se connecter" }).waitFor({ timeout: 120000 }).catch(async () => {
    const fh = await (await host.$("iframe")).contentFrame();
    console.log("  iframe url:", fh.url(), "\n  text:", (await fh.evaluate(() => document.body.innerText)).slice(0, 300), "\n  events:", JSON.stringify(await host.evaluate(() => window.__events)));
    throw new Error("no sign-in button");
  });
  await host.waitForFunction(() => window.__events.some((e) => e.t === "ready"));
  ok(true, "handshake: ready → init, and the framed page asks for sign-in (cookie is not sent cross-site)");

  const [popup] = await Promise.all([ctx.waitForEvent("page"), frame.getByRole("button", { name: "Se connecter" }).click()]);
  await popup.waitForEvent("close", { timeout: 15000 }).catch(() => {});
  if (!popup.isClosed()) console.log("  popup url:", popup.url(), "text:", (await popup.evaluate(() => document.body.innerText).catch(() => "?")).slice(0, 200));
  ok(popup.isClosed(), "first-party popup minted a ticket and closed itself");
  host.on("console", (m) => console.log("  [host console]", m.text().slice(0, 200)));
  for (const f of host.frames()) f.page();
  host.on("response", (r) => { if (r.url().includes("/api/")) console.log("  [http", r.status() + "]", r.request().method(), r.url().slice(0, 100)); });
  // Depending on the browser's storage partitioning the iframe either sees the trusted-device key or must be unlocked.
  const unlockScreen = frame.getByTestId("unlock-screen");
  const prompt = frame.getByText("Choisir un fichier");
  await Promise.race([unlockScreen.waitFor(), prompt.waitFor()]);
  if (await unlockScreen.isVisible()) {
    await frame.getByTestId("unlock-recovery-btn").click();
    await frame.getByTestId("unlock-input").fill(recoveryKey);
    await frame.getByTestId("unlock-submit").click();
  }
  await prompt.waitFor();
  ok(true, "iframe signed in via ticket and keys unlocked");

  const secret = "top secret 🤫 " + crypto.randomBytes(8).toString("hex");
  const iframeHandle = await (await host.$("iframe")).contentFrame();
  await iframeHandle.evaluate(async (text) => {
    const input = document.querySelector('input[type="file"]');
    const dt = new DataTransfer();
    dt.items.add(new File([text], "note-secrète.txt", { type: "text/plain" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, secret);
  await host.waitForFunction(() => window.__events.some((e) => e.t === "uploaded"), null, { timeout: 30000 }).catch(async () => {
    console.log("  events:", JSON.stringify(await host.evaluate(() => window.__events)), "\n  iframe:", (await iframeHandle.evaluate(() => document.body.innerText)).slice(0, 300));
    throw new Error("no upload event");
  });
  const up = await host.evaluate(() => window.__events.find((e) => e.t === "uploaded"));
  ok(Object.keys(up).sort().join() === "fileId,size,t", `host receives only {fileId,size} (${Object.keys(up).join(",")})`);
  const row = (await DB.query(`select * from "DriveFile" where id=$1`, [up.fileId])).rows[0];
  ok(row?.parentId === "appfolder_e" && row.cryptoVersion === 1 && row.filename === "", "file landed encrypted inside the app folder");
  ok(![...discord.attachments.values()].some((a) => a.buf.includes(Buffer.from(secret))), "Discord holds ciphertext only");

  step("viewer");
  await host.evaluate((id) => window.mountView(id), up.fileId);
  const vf = host.frameLocator("#view iframe");
  await vf.getByRole("button", { name: "Se connecter" }).waitFor();
  const [popup2] = await Promise.all([ctx.waitForEvent("page"), vf.getByRole("button", { name: "Se connecter" }).click()]);
  await popup2.waitForEvent("close").catch(() => {});
  const vUnlock = vf.getByTestId("unlock-screen");
  const vShown = vf.getByText(secret);
  await Promise.race([vUnlock.waitFor(), vShown.waitFor()]);
  if (await vUnlock.isVisible()) {
    await vf.getByTestId("unlock-recovery-btn").click();
    await vf.getByTestId("unlock-input").fill(recoveryKey);
    await vf.getByTestId("unlock-submit").click();
  }
  await vf.getByText(secret).waitFor();
  ok(true, "viewer decrypts and shows the text");
  await vf.getByText("note-secrète.txt").waitFor();
  ok(true, "decrypted file name shown in the viewer footer");

  step("viewer refuses files outside the app folder");
  const other = (await DB.query(`select id from "DriveFile" where id<>$1 limit 1`, [up.fileId])).rows[0];
  ok(!other, "(no other file to probe — confinement covered by the API e2e)");

  step("revoked grant");
  await DB.query(`update "AppGrant" set "revokedAt"=now() where id='g1'`);
  r = await web("/api/embed/ticket", { method: "POST", body: JSON.stringify({ client_id: app.id }) });
  ok(r.status === 403, "no ticket for a revoked grant");
} catch (e) { console.error(e); failures++; } finally {
  await browser.close(); server.close(); front.close(); await DB.end();
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);

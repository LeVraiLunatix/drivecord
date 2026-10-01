/**
 * API-level integration test of the OAuth 2.1 flow against the running dev server + Postgres.
 * Needs `e2e/infra.sh up`. Run: node e2e/oauth.e2e.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { encode } from "next-auth/jwt";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const SECRET = fs.readFileSync("/tmp/e2e-auth-secret", "utf8").trim();
const DB = new pg.Client({ connectionString: "postgresql://postgres@localhost:5433/drivecord" });
await DB.connect();

let failures = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${m}`); if (!c) failures++; };
const step = (s) => console.log(`\n▶ ${s}`);

const session = await encode({ token: { sub: "u_oauth", id: "u_oauth", email: "oauth@example.com", name: "Dev", level: "full" }, secret: SECRET, salt: "authjs.session-token", maxAge: 86400 });
const H = { cookie: `authjs.session-token=${session}`, "content-type": "application/json", origin: BASE };
const api = (path, init = {}) => fetch(BASE + path, { redirect: "manual", ...init, headers: { ...H, ...(init.headers ?? {}) } });
const json = async (r) => r.json().catch(() => ({}));

const pkce = () => {
  const verifier = crypto.randomBytes(48).toString("base64url");
  return { verifier, challenge: crypto.createHash("sha256").update(verifier).digest("base64url") };
};
const REDIRECT = "https://app.example/cb";
const authParams = (app, p, extra = {}) => ({
  client_id: app, redirect_uri: REDIRECT, response_type: "code", code_challenge: p.challenge, code_challenge_method: "S256",
  scope: "app_folder:write app_folder:read profile:basic", state: "st4te", ...extra,
});
const form = (o) => new URLSearchParams(o).toString();
const token = (body, headers = {}) =>
  fetch(BASE + "/api/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: form(body) });

try {
  await DB.query(`delete from "User" where id='u_oauth'`);
  await DB.query(`insert into "User"(id,email,name,"updatedAt") values('u_oauth','oauth@example.com','Dev',now())`);
  await DB.query(`insert into "Webhook"(id,"userId","driveId","encryptedUrl",name,"channelId","e2eeVersion","dkWrapped","updatedAt") values('wh_oauth','u_oauth','drive_oauth','x','Mon drive','c',1,'v1.AAAAAAAAAAAAAAAA.AAAA',now())`);
  await DB.query(`insert into "DriveFolder"(id,"webhookId","driveId","parentId",name,"encName","updatedAt") values('appfolder01','wh_oauth','drive_oauth','','','v1.AAAAAAAAAAAAAAAA.AAAA',now())`);

  step("registering apps");
  let r = await api("/api/developers/apps", { method: "POST", body: JSON.stringify({ name: "Wavecast", homepageUrl: "https://app.example", redirectUris: [REDIRECT], allowedOrigins: ["https://app.example"] }) });
  const pub = await json(r);
  ok(r.status === 201 && /^app_/.test(pub.app?.id) && pub.clientSecret === null, "public client created (no secret)");
  r = await api("/api/developers/apps", { method: "POST", body: JSON.stringify({ name: "Backend", homepageUrl: "https://app.example", redirectUris: [REDIRECT], confidential: true }) });
  const conf = await json(r);
  ok(r.status === 201 && /^dvc_cs_/.test(conf.clientSecret), "confidential client created (secret shown once)");
  const dbApp = (await DB.query(`select "clientSecretHash" from "App" where id=$1`, [conf.app.id])).rows[0];
  ok(dbApp.clientSecretHash && !dbApp.clientSecretHash.includes(conf.clientSecret), "only the secret's hash is stored");
  r = await api("/api/developers/apps", { method: "POST", body: JSON.stringify({ name: "Bad", homepageUrl: "https://app.example", redirectUris: ["javascript:alert(1)"] }) });
  ok(r.status === 400, "javascript: redirect URI refused at registration");
  r = await api("/api/developers/apps", { method: "POST", body: JSON.stringify({ name: "Bad", homepageUrl: "https://app.example", redirectUris: ["http://evil.example/cb"] }) });
  ok(r.status === 400, "plain-http (non-loopback) redirect URI refused");

  step("authorize: request validation");
  const p1 = pkce();
  const get = (params) => api("/api/oauth/authorize?" + form(params));
  r = await get(authParams(pub.app.id, p1, { redirect_uri: "https://evil.example/cb" }));
  let d = await json(r);
  ok(r.status === 400 && d.fatal === true && !d.redirectUrl, "unregistered redirect_uri → fatal, NEVER redirected");
  r = await get(authParams("app_doesnotexist0000000", p1));
  ok((await json(r)).fatal === true, "unknown client → fatal");
  r = await get(authParams(pub.app.id, p1, { code_challenge_method: "plain" }));
  d = await json(r);
  ok(r.status === 400 && d.fatal === false && d.redirectUrl.includes("error=invalid_request") && d.redirectUrl.includes("state=st4te"), "PKCE `plain` refused (error redirected with state)");
  r = await get(authParams(pub.app.id, p1, { code_challenge: undefined }));
  ok((await json(r)).error === "invalid_request", "missing code_challenge refused");
  r = await get(authParams(pub.app.id, p1, { scope: "app_folder:write drive:everything" }));
  ok((await json(r)).error === "invalid_scope", "unknown scope refused");
  r = await get(authParams(pub.app.id, p1, { response_type: "token" }));
  ok((await json(r)).error === "unsupported_response_type", "implicit flow (response_type=token) refused");

  step("consent screen data");
  r = await get(authParams(pub.app.id, p1));
  d = await json(r);
  ok(r.status === 200 && d.app.name === "Wavecast" && d.scopes.length === 3 && d.drives[0].driveId === "drive_oauth", "consent data: app, French scopes, drives");
  ok(d.scopes.some((s) => /ton identifiant/.test(s.label)) && !JSON.stringify(d).includes("clientSecret"), "scopes described in French, no secret leaked");
  const noSession = await fetch(BASE + "/api/oauth/authorize?" + form(authParams(pub.app.id, p1)));
  ok(noSession.status === 401, "consent data requires a signed-in user");

  step("consent decision");
  const consent = (p, extra = {}, headers = {}) =>
    api("/api/oauth/authorize", { method: "POST", headers, body: JSON.stringify({ ...authParams(pub.app.id, p), approve: true, driveId: "drive_oauth", appFolderId: "appfolder01", ...extra }) });
  r = await consent(p1, {}, { origin: "https://evil.example" });
  ok(r.status === 403, "cross-site consent POST refused (CSRF)");
  r = await consent(p1, { approve: false });
  d = await json(r);
  ok(d.redirectUrl.includes("error=access_denied") && d.redirectUrl.includes("state=st4te"), "deny → access_denied + state");
  r = await consent(p1, { appFolderId: "nope" });
  ok(r.status === 400, "app folder must exist in the chosen drive");
  r = await consent(p1, { driveId: "drive_not_mine" });
  ok(r.status === 404, "someone else's / unknown drive refused");
  r = await consent(p1);
  d = await json(r);
  const redirect = new URL(d.redirectUrl);
  const code = redirect.searchParams.get("code");
  ok(redirect.origin + redirect.pathname === REDIRECT && /^dvc_ac_/.test(code) && redirect.searchParams.get("state") === "st4te", "approve → redirect to the registered URI with code + state");
  const grant = (await DB.query(`select * from "AppGrant" where "appId"=$1 and "userId"='u_oauth'`, [pub.app.id])).rows[0];
  ok(grant?.appFolderId === "appfolder01" && grant.webhookId === "wh_oauth", "grant bound to the chosen drive and app folder");
  const codeRow = (await DB.query(`select * from "OAuthCode" where "appId"=$1`, [pub.app.id])).rows[0];
  ok(codeRow && !JSON.stringify(codeRow).includes(code), "authorization code stored hashed");

  step("token endpoint: code exchange");
  const tk = (extra = {}, headers = {}) => token({ grant_type: "authorization_code", client_id: pub.app.id, code, redirect_uri: REDIRECT, code_verifier: p1.verifier, ...extra }, headers);
  r = await tk({ code_verifier: pkce().verifier });
  ok((await json(r)).error === "invalid_grant", "wrong PKCE verifier refused");
  r = await tk({ redirect_uri: "https://app.example/other" });
  ok((await json(r)).error === "invalid_grant", "redirect_uri must equal the one used at /authorize");
  r = await tk({ client_id: conf.app.id });
  ok(r.status === 401 || (await json(r)).error, "a code can't be redeemed by another client");
  r = await tk();
  d = await json(r);
  ok(r.status === 200 && /^dvc_at_/.test(d.access_token) && /^dvc_rt_/.test(d.refresh_token) && d.expires_in === 3600 && d.token_type === "Bearer", "valid exchange → access (1 h) + refresh token");
  ok(d.scope === "app_folder:write app_folder:read profile:basic", "scope echoed");
  ok((r.headers.get("cache-control") ?? "").includes("no-store"), "token response is no-store");
  const t1 = d;
  const stored = (await DB.query(`select * from "OAuthToken" where "appId"=$1`, [pub.app.id])).rows[0];
  ok(!JSON.stringify(stored).includes(t1.access_token) && !JSON.stringify(stored).includes(t1.refresh_token), "tokens stored hashed only");
  r = await tk();
  ok((await json(r)).error === "invalid_grant", "code replay refused…");
  const afterReplay = (await DB.query(`select count(*)::int n from "OAuthToken" where "appId"=$1 and "revokedAt" is null`, [pub.app.id])).rows[0].n;
  ok(afterReplay === 0, "…and it REVOKED every token that code had produced");

  step("refresh-token rotation + reuse detection");
  const p2 = pkce();
  d = await json(await consent(p2));
  const code2 = new URL(d.redirectUrl).searchParams.get("code");
  d = await json(await token({ grant_type: "authorization_code", client_id: pub.app.id, code: code2, redirect_uri: REDIRECT, code_verifier: p2.verifier }));
  const a1 = d;
  r = await token({ grant_type: "refresh_token", client_id: pub.app.id, refresh_token: a1.refresh_token });
  d = await json(r);
  ok(r.status === 200 && d.refresh_token !== a1.refresh_token && d.access_token !== a1.access_token, "refresh → brand-new pair (rotation)");
  const a2 = d;
  r = await token({ grant_type: "refresh_token", client_id: pub.app.id, refresh_token: a1.refresh_token });
  ok((await json(r)).error === "invalid_grant", "reusing the rotated-out refresh token is refused");
  r = await token({ grant_type: "refresh_token", client_id: pub.app.id, refresh_token: a2.refresh_token });
  ok((await json(r)).error === "invalid_grant", "…and the whole family is revoked (even the newest refresh token)");

  step("confidential client");
  const p3 = pkce();
  r = await api("/api/oauth/authorize", { method: "POST", body: JSON.stringify({ ...authParams(conf.app.id, p3), approve: true, driveId: "drive_oauth", appFolderId: "appfolder01" }) });
  const code3 = new URL((await json(r)).redirectUrl).searchParams.get("code");
  const cx = (extra = {}, headers = {}) => token({ grant_type: "authorization_code", client_id: conf.app.id, code: code3, redirect_uri: REDIRECT, code_verifier: p3.verifier, ...extra }, headers);
  r = await cx();
  ok(r.status === 401 && (await json(r)).error === "invalid_client", "no client secret → invalid_client");
  r = await cx({ client_secret: "dvc_cs_" + "A".repeat(43) });
  ok(r.status === 401, "wrong client secret → invalid_client");
  r = await cx({}, { authorization: "Basic " + Buffer.from(`${conf.app.id}:${conf.clientSecret}`).toString("base64") });
  ok(r.status === 200, "correct secret (HTTP Basic) → tokens");
  const c1 = await json(r);

  step("revocation");
  r = await fetch(BASE + "/api/oauth/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_id: pub.app.id, token: "dvc_at_" + "A".repeat(43) }) });
  ok(r.status === 200, "revoking an unknown token is not an error (RFC 7009)");
  r = await fetch(BASE + "/api/oauth/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + Buffer.from(`${conf.app.id}:${conf.clientSecret}`).toString("base64") }, body: form({ token: c1.access_token }) });
  r = await token({ grant_type: "refresh_token", client_id: conf.app.id, refresh_token: c1.refresh_token }, { authorization: "Basic " + Buffer.from(`${conf.app.id}:${conf.clientSecret}`).toString("base64") });
  ok((await json(r)).error === "invalid_grant", "revoking an access token revokes its refresh token too");

  step("grant revocation by the user + app disable");
  const p4 = pkce();
  const code4 = new URL((await json(await consent(p4))).redirectUrl).searchParams.get("code");
  const t4 = await json(await token({ grant_type: "authorization_code", client_id: pub.app.id, code: code4, redirect_uri: REDIRECT, code_verifier: p4.verifier }));
  const list = await json(await api("/api/account/apps"));
  ok(list.grants.some((g) => g.app.name === "Wavecast" && g.driveName === "Mon drive"), "connected apps listed for the user");
  r = await api(`/api/account/apps/${list.grants.find((g) => g.app.name === "Wavecast").id}`, { method: "DELETE" });
  ok(r.status === 204, "user disconnects the app");
  r = await token({ grant_type: "refresh_token", client_id: pub.app.id, refresh_token: t4.refresh_token });
  ok((await json(r)).error === "invalid_grant", "after disconnect the refresh token is dead immediately");
  const live = (await DB.query(`select count(*)::int n from "OAuthToken" where "grantId"=$1 and "revokedAt" is null`, [grant.id])).rows[0].n;
  ok(live === 0, "no live token left on the grant");

  step("CORS + discovery");
  r = await fetch(BASE + "/api/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://app.example" }, body: form({ grant_type: "refresh_token", client_id: pub.app.id, refresh_token: "dvc_rt_" + "A".repeat(43) }) });
  ok(r.headers.get("access-control-allow-origin") === "https://app.example", "registered origin gets an exact CORS echo");
  r = await fetch(BASE + "/api/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" }, body: form({ grant_type: "refresh_token", client_id: pub.app.id, refresh_token: "dvc_rt_" + "A".repeat(43) }) });
  ok(!r.headers.get("access-control-allow-origin"), "unregistered origin gets no CORS header");
  const meta = await json(await fetch(BASE + "/.well-known/oauth-authorization-server"));
  ok(meta.code_challenge_methods_supported?.join() === "S256" && meta.grant_types_supported.includes("refresh_token") && !meta.grant_types_supported.includes("implicit"), "discovery: S256 only, no implicit grant");

  step("disabling an app");
  r = await api(`/api/developers/apps/${pub.app.id}`, { method: "DELETE" });
  ok(r.status === 204, "developer disables the app");
  const p5 = pkce();
  r = await get(authParams(pub.app.id, p5));
  ok((await json(r)).fatal === true, "a disabled app can no longer start an authorization");
} catch (err) {
  failures++;
  console.error("\n✗ aborted:", err);
} finally {
  await DB.end();
}
console.log(failures === 0 ? "\n✅ all OAuth checks passed" : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

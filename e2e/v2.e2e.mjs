/**
 * API-level integration test of /api/v2 (PAT + OAuth app principal) against the dev server with the
 * server-side Discord fake. Needs `e2e/infra.sh up`. Run: node e2e/v2.e2e.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { encode } from "next-auth/jwt";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const SECRET = fs.readFileSync("/tmp/e2e-auth-secret", "utf8").trim();
const ENC = Buffer.from(fs.readFileSync("/tmp/e2e-enc-key", "utf8").trim(), "hex");
const DB = new pg.Client({ connectionString: "postgresql://postgres@localhost:5433/drivecord" });
await DB.connect();

let failures = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${m}`); if (!c) failures++; };
const step = (s) => console.log(`\n▶ ${s}`);
const encryptUrl = (url) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", ENC, iv);
  const ct = Buffer.concat([c.update(url, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
};
const blob = "v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAA==";
const nid = () => crypto.randomBytes(16).toString("base64url").slice(0, 21);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

const session = await encode({ token: { sub: "u_v2", id: "u_v2", email: "v2@example.com", name: "Dev", level: "full" }, secret: SECRET, salt: "authjs.session-token", maxAge: 86400 });
const web = (path, init = {}) => fetch(BASE + path, { ...init, headers: { cookie: `authjs.session-token=${session}`, "content-type": "application/json", origin: BASE, ...(init.headers ?? {}) } });
const call = (tok, method, path, body, headers = {}) =>
  fetch(BASE + "/api/v2" + path, {
    method,
    headers: { authorization: `Bearer ${tok}`, ...(body !== undefined && !(body instanceof Buffer) ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body),
  });
const j = (r) => r.json().catch(() => ({}));

try {
  await DB.query(`delete from "User" where id='u_v2'`);
  await DB.query(`delete from "DriveFolder" where id in ('appfolder01','appchild001','outsider001')`);
  await DB.query(`insert into "User"(id,email,name,"updatedAt") values('u_v2','v2@example.com','Dev',now())`);
  await DB.query(`insert into "Webhook"(id,"userId","driveId","encryptedUrl",name,"channelId","e2eeVersion","dkWrapped","updatedAt") values('wh_v2','u_v2','drive_v2',$1,'Mon drive','c',1,'v1.AAAAAAAAAAAAAAAA.AAAA',now())`, [encryptUrl("https://discord.com/api/webhooks/123456789012345678/abcDEF_token-xyz")]);
  for (const [id, parent] of [["appfolder01", ""], ["appchild001", "appfolder01"], ["outsider001", ""]]) {
    await DB.query(`insert into "DriveFolder"(id,"webhookId","driveId","parentId",name,"encName","updatedAt") values($1,'wh_v2','drive_v2',$2,'',$3,now())`, [id, parent, blob]);
  }

  step("personal token");
  let r = await web("/api/settings/personal-tokens", { method: "POST", body: JSON.stringify({ driveId: "drive_v2", name: "CI", scopes: ["drive:read", "drive:write", "drive:delete", "drive:share"] }) });
  const pat = (await j(r)).token;
  ok(r.status === 201 && /^dvc_pat_/.test(pat), "PAT created");
  r = await web("/api/settings/personal-tokens", { method: "POST", body: JSON.stringify({ driveId: "drive_v2", name: "ro", scopes: ["drive:read"] }) });
  const ro = (await j(r)).token;
  ok(!JSON.stringify((await DB.query(`select * from "PersonalToken"`)).rows).includes(pat), "only the hash is stored");

  step("auth & errors");
  r = await fetch(BASE + "/api/v2/me");
  let d = await j(r);
  ok(r.status === 401 && d.error?.code === "unauthorized" && r.headers.get("x-request-id") && r.headers.get("www-authenticate"), "no token → 401 unauthorized + request id");
  r = await call("dvc_pat_" + "A".repeat(43), "GET", "/me");
  ok(r.status === 401, "unknown token → 401");
  r = await call(pat, "GET", "/me");
  d = await j(r);
  ok(r.status === 200 && d.principal.type === "personal_token" && d.drive.encrypted === true && d.user.id === "u_v2", "GET /me");
  ok(r.headers.get("ratelimit-limit") && (r.headers.get("cache-control") ?? "").includes("no-store") && !r.headers.get("access-control-allow-origin"), "RateLimit headers, no-store, no CORS for non-browser call");
  r = await call(pat, "GET", "/me", undefined, { origin: "https://evil.example" });
  ok(r.status === 403 && (await j(r)).error.code === "origin_not_allowed", "browser origin not on the allowlist → 403");
  r = await call(ro, "POST", "/uploads", { fileId: nid(), size: 10 });
  ok(r.status === 403 && (await j(r)).error.code === "insufficient_scope", "read-only token cannot write");

  step("encrypted upload (3 chunks)");
  const CIPHER = 8 * 1024 * 1024 + 16;
  const total = 2 * CIPHER + 1000;
  const bytes = crypto.randomBytes(total);
  const fileId = nid();
  const idem = "idem-" + nid();
  r = await call(pat, "POST", "/uploads", { fileId, size: total }, { "idempotency-key": idem });
  const up = await j(r);
  ok(r.status === 201 && up.chunkCount === 3 && up.chunkSize === CIPHER, "upload session (3 chunks)");
  const r2 = await call(pat, "POST", "/uploads", { fileId, size: total }, { "idempotency-key": idem });
  ok(r2.status === 201 && r2.headers.get("idempotent-replay") === "true" && (await j(r2)).uploadId === up.uploadId, "same Idempotency-Key → replayed response");
  r = await call(pat, "POST", "/uploads", { fileId, size: total + 1 }, { "idempotency-key": idem });
  ok(r.status === 422, "same key, different body → 422");
  const put = (i, buf, h = {}) => call(pat, "PUT", `/uploads/${up.uploadId}/chunks/${i}`, buf, { "content-type": "application/octet-stream", ...h });
  const part = (i) => bytes.subarray(i * CIPHER, Math.min(total, (i + 1) * CIPHER));
  r = await put(0, part(0).subarray(0, 100));
  ok(r.status === 400 && (await j(r)).error.code === "chunk_mismatch", "non-last chunk with the wrong size refused");
  r = await put(0, part(0), { "x-chunk-sha256": "0".repeat(64) });
  ok(r.status === 400, "wrong X-Chunk-SHA256 refused");
  r = await put(5, part(0));
  ok(r.status === 400, "index beyond the session refused");
  r = await call(pat, "POST", `/uploads/${up.uploadId}/complete`, { encMeta: blob, fkWrapped: blob, noncePrefix: "AAAAAAAAAA==" });
  ok(r.status === 409 && (await j(r)).error.code === "upload_incomplete", "complete with missing chunks refused");
  for (const i of [2, 0, 1]) {
    r = await put(i, part(i), { "x-chunk-sha256": sha(part(i)) });
    ok(r.status === 200 && (await j(r)).sha256 === sha(part(i)), `chunk ${i} stored`);
  }
  r = await call(pat, "POST", `/uploads/${up.uploadId}/complete`, { encMeta: blob, fkWrapped: blob, noncePrefix: "AAAAAAAAAA==", surprise: 1 });
  ok(r.status === 400 && (await j(r)).error.code === "unknown_field", "unknown field refused");
  r = await call(pat, "POST", `/uploads/${up.uploadId}/complete`, { encMeta: blob, fkWrapped: blob, noncePrefix: "AAAAAAAAAA==" });
  d = await j(r);
  ok(r.status === 201 && d.id === fileId && d.size === total && d.filename === undefined, "file created; no plaintext name/type exposed");
  r = await call(pat, "POST", `/uploads/${up.uploadId}/complete`, { encMeta: blob, fkWrapped: blob, noncePrefix: "AAAAAAAAAA==" });
  ok(r.status === 409, "session can't be completed twice");

  step("download chunks + list + patch");
  const got = [];
  for (let i = 0; i < 3; i++) { r = await call(pat, "GET", `/files/${fileId}/chunks/${i}`); got.push(Buffer.from(await r.arrayBuffer())); }
  ok(Buffer.concat(got).equals(bytes), "chunks come back byte-identical");
  r = await call(pat, "GET", "/files?limit=1");
  d = await j(r);
  ok(r.status === 200 && d.files.length === 1 && d.files[0].id === fileId, "list files");
  r = await call(pat, "PATCH", `/files/${fileId}`, { parentId: "appchild001" });
  ok(r.status === 200 && (await j(r)).parentId === "appchild001", "move file");
  r = await call(pat, "PATCH", `/files/${fileId}`, { parentId: "nonexistent" });
  ok(r.status === 400 && (await j(r)).error.code === "parent_not_found", "move into unknown folder refused");

  step("folders");
  r = await call(pat, "POST", "/folders", { parentId: "", encName: blob });
  d = await j(r);
  ok(r.status === 201 && d.encName === blob, "create folder (encrypted name)");
  r = await call(pat, "PATCH", `/folders/appfolder01`, { parentId: "appchild001" });
  ok(r.status === 409, "folder can't be moved into its own descendant");
  r = await call(pat, "DELETE", `/folders/appfolder01?permanent=true`);
  ok(r.status === 409, "non-empty folder can't be removed permanently");

  step("public upload + shares");
  const pubId = nid();
  const pubBytes = Buffer.from("hello public world");
  r = await call(pat, "POST", "/uploads", { fileId: pubId, size: pubBytes.length, visibility: "public" });
  const pu = await j(r);
  await call(pat, "PUT", `/uploads/${pu.uploadId}/chunks/0`, pubBytes, { "content-type": "application/octet-stream" });
  r = await call(pat, "POST", `/uploads/${pu.uploadId}/complete`, { filename: "hello.txt", mimeType: "text/plain" });
  d = await j(r);
  ok(r.status === 201 && d.filename === "hello.txt" && d.visibility === "public", "public file stored with clear name");
  r = await call(pat, "POST", `/files/${pubId}/public`);
  d = await j(r);
  ok(r.status === 201 && /\/api\/v1\/public\//.test(d.url), "public link created");
  r = await call(pat, "POST", `/files/${fileId}/public`);
  ok(r.status === 409, "encrypted file can never get a public link");
  r = await call(pat, "POST", `/files/${fileId}/shares`, { expiresInDays: 7 }, { "idempotency-key": "share-" + nid() });
  d = await j(r);
  ok(r.status === 201 && d.token && /\/s\//.test(d.url), "encrypted share created (key stays in the fragment)");
  r = await call(ro, "POST", `/files/${fileId}/shares`, {});
  ok(r.status === 403, "sharing needs drive:share");
  r = await call(pat, "DELETE", `/shares/${d.token}`);
  ok(r.status === 204, "share revoked");

  step("changes journal");
  r = await call(pat, "GET", "/changes?cursor=0");
  d = await j(r);
  ok(r.status === 200 && d.changes.some((c) => c.id === fileId) && /^\d+$/.test(d.cursor), "changes feed lists the writes");
  const c2 = await j(await call(pat, "GET", `/changes?cursor=${d.cursor}`));
  ok(c2.changes.length === 0 && c2.hasMore === false, "cursor resumes after the last change");

  step("delete");
  r = await call(pat, "DELETE", `/files/${fileId}`);
  ok(r.status === 204 && (await j(await call(pat, "GET", `/files/${fileId}`))).trashed === true, "DELETE trashes");
  r = await call(pat, "DELETE", `/files/${fileId}?permanent=true`);
  ok(r.status === 204 && (await call(pat, "GET", `/files/${fileId}`)).status === 404, "permanent delete erases the file");
  ok((await DB.query(`select count(*)::int n from "UploadSession" where "fileId"=$1 and status='completed'`, [fileId])).rows[0].n === 1, "session marked completed");

  step("OAuth app: confinement to the app folder");
  r = await web("/api/developers/apps", { method: "POST", body: JSON.stringify({ name: "Conf", homepageUrl: "https://app.example", redirectUris: ["https://app.example/cb"], allowedOrigins: ["https://app.example"] }) });
  const app = (await j(r)).app;
  const ver = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(ver).digest("base64url");
  r = await web("/api/oauth/authorize", { method: "POST", body: JSON.stringify({ client_id: app.id, redirect_uri: "https://app.example/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", scope: "app_folder:write app_folder:read app_folder:delete", state: "s", approve: true, driveId: "drive_v2", appFolderId: "appfolder01" }) });
  const code = new URL((await j(r)).redirectUrl).searchParams.get("code");
  r = await fetch(BASE + "/api/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: app.id, code, redirect_uri: "https://app.example/cb", code_verifier: ver }) });
  const at = (await j(r)).access_token;
  ok(/^dvc_at_/.test(at), "app token issued");
  r = await call(at, "GET", "/me", undefined, { origin: "https://app.example" });
  ok(r.status === 200 && r.headers.get("access-control-allow-origin") === "https://app.example" && (await j(r)).principal.appFolderId === "appfolder01", "CORS echoes only the allowed origin");
  r = await call(at, "GET", "/changes");
  ok(r.status === 403, "apps can't read the drive-wide change journal");
  r = await call(at, "POST", `/files/${pubId}/public`);
  ok(r.status === 403, "apps can't create public links / shares");
  r = await call(at, "GET", `/files?parentId=outsider001`);
  ok(r.status === 404, "listing a folder outside the app folder → 404");
  r = await call(at, "POST", "/uploads", { fileId: nid(), size: 10, parentId: "outsider001" });
  ok(r.status === 400 && (await j(r)).error.code === "parent_not_found", "upload outside the app folder refused");
  r = await call(at, "POST", "/uploads", { fileId: nid(), size: 10, parentId: "" });
  ok(r.status === 400, "upload to the drive root refused");
  r = await call(at, "GET", `/files/${pubId}`);
  ok(r.status === 404, "a file outside the app folder looks non-existent");
  const appFile = nid();
  const small = crypto.randomBytes(64);
  d = await j(await call(at, "POST", "/uploads", { fileId: appFile, size: 64 }));
  ok(d.parentId === "appfolder01", "default destination = the app folder");
  await call(at, "PUT", `/uploads/${d.uploadId}/chunks/0`, small, { "content-type": "application/octet-stream" });
  r = await call(at, "POST", `/uploads/${d.uploadId}/complete`, { encMeta: blob, fkWrapped: blob, noncePrefix: "AAAAAAAAAA==" });
  ok(r.status === 201, "app uploads inside its folder");
  r = await call(at, "PATCH", `/files/${appFile}`, { parentId: "outsider001" });
  ok(r.status === 400, "app can't move a file out of its folder");
  r = await call(at, "PATCH", "/folders/appfolder01", { trashed: true });
  ok(r.status === 409, "app folder root is protected");
  const other = await call(pat, "PUT", `/uploads/${d.uploadId}/chunks/0`, small, { "content-type": "application/octet-stream" });
  ok(other.status === 404, "another principal can't touch someone else's upload session");

  step("revocation");
  const grantId = (await DB.query(`select id from "AppGrant" where "appId"=$1`, [app.id])).rows[0].id;
  r = await web(`/api/account/apps/${grantId}`, { method: "DELETE" });
  ok(r.status < 300, "user revokes the app");
  r = await call(at, "GET", "/me");
  ok(r.status === 401, "revoked grant → 401 immediately");
  const patId = (await DB.query(`select id from "PersonalToken" where "userId"='u_v2' order by "createdAt" limit 1`)).rows[0].id;
  r = await web(`/api/settings/personal-tokens/${patId}`, { method: "DELETE" });
  ok(r.status < 300 && (await call(pat, "GET", "/me")).status === 401, "revoked PAT → 401");
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await DB.end();
}
console.log(failures === 0 ? "\nALL GOOD" : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);

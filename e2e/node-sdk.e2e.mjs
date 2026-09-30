/** @drivecord/node against the dev server (server-side Discord fake). Run: node packages/node/build.mjs && node e2e/node-sdk.e2e.mjs */
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { encode } from "next-auth/jwt";
import { DrivecordNode } from "../packages/node/dist/index.js";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const SECRET = fs.readFileSync("/tmp/e2e-auth-secret", "utf8").trim();
const ENC = Buffer.from(fs.readFileSync("/tmp/e2e-enc-key", "utf8").trim(), "hex");
const DB = new pg.Client({ connectionString: "postgresql://postgres@localhost:5433/drivecord" });
await DB.connect();
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${m}`); if (!c) failures++; };
const encryptUrl = (url) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", ENC, iv); const ct = Buffer.concat([c.update(url, "utf8"), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64"); };

try {
  await DB.query(`delete from "User" where id='u_node'`);
  await DB.query(`insert into "User"(id,email,name,"updatedAt") values('u_node','node@example.com','Dev',now())`);
  await DB.query(`insert into "Webhook"(id,"userId","driveId","encryptedUrl",name,"channelId","e2eeVersion","dkWrapped","updatedAt") values('wh_node','u_node','drive_node',$1,'Mon drive','c',1,'v1.AAAAAAAAAAAAAAAA.AAAA',now())`, [encryptUrl("https://discord.com/api/webhooks/123456789012345678/abcDEF_token-xyz")]);
  const session = await encode({ token: { sub: "u_node", id: "u_node", email: "node@example.com", level: "full" }, secret: SECRET, salt: "authjs.session-token", maxAge: 3600 });
  const r = await fetch(BASE + "/api/settings/personal-tokens", { method: "POST", headers: { cookie: `authjs.session-token=${session}`, "content-type": "application/json", origin: BASE }, body: JSON.stringify({ driveId: "drive_node", name: "sdk", scopes: ["drive:read", "drive:write", "drive:delete"] }) });
  const { token } = await r.json();

  const driveKey = crypto.randomBytes(32);
  const dc = new DrivecordNode({ token, driveKey, baseUrl: BASE });
  ok((await dc.me()).drive.encrypted === true, "me()");
  const data = crypto.randomBytes(9 * 1024 * 1024 + 123);
  const { fileId } = await dc.upload({ name: "rapport 日本.pdf", type: "application/pdf", data });
  ok(/^[\w-]{21}$/.test(fileId), "upload (2 chunks) returns a file id");
  const { files } = await dc.list();
  ok(files.length === 1 && files[0].name === "rapport 日本.pdf" && files[0].type === "application/pdf" && files[0].plainSize === data.length, "list decrypts names locally");
  const f = await dc.download(fileId);
  ok(f.name === "rapport 日本.pdf" && Buffer.from(f.data).equals(data), "download round-trips byte for byte");
  const other = new DrivecordNode({ token, driveKey: crypto.randomBytes(32), baseUrl: BASE });
  ok((await other.list()).files[0].name === null, "wrong drive key → names stay unreadable");
  await other.download(fileId).then(() => ok(false, "wrong key must not decrypt"), () => ok(true, "wrong drive key cannot decrypt the content"));
  await dc.delete(fileId, { permanent: true });
  ok((await dc.list()).files.length === 0, "permanent delete");
  await dc.download(fileId).then(() => ok(false, "gone"), (e) => ok(e.status === 404, "deleted file → 404"));
} catch (e) { console.error(e); failures++; } finally { await DB.end(); }
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);

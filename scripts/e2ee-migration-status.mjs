/**
 * Reports how many drives/files are still on the legacy server-held-key scheme.
 * (The scheme itself — Webhook.encKey, file-server-crypto.ts — was removed in the legacy cleanup.)
 * Run: DATABASE_URL=… node scripts/e2ee-migration-status.mjs
 */
import pg from "pg";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const one = async (sql) => Number((await db.query(sql)).rows[0].n);
const out = {
  drivesTotal: await one(`select count(*)::int n from "Webhook"`),
  drivesNotMigrated: await one(`select count(*)::int n from "Webhook" where "e2eeVersion" = 0`),
  legacyEncryptedFiles: await one(`select count(*)::int n from "DriveFile" where "encIv" is not null and "cryptoVersion" = 0 and locked = false`),
  plaintextFiles: await one(`select count(*)::int n from "DriveFile" where "encIv" is null and "cryptoVersion" = 0 and locked = false and visibility = 'private'`),
};
console.table(out);
const ready = out.drivesNotMigrated === 0 && out.legacyEncryptedFiles === 0;
console.log(ready ? "READY: the legacy cleanup can ship." : "NOT READY: some drives or files are still on the legacy scheme.");
await db.end();
process.exit(ready ? 0 : 2);

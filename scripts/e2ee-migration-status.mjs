/**
 * Phase 6 gate: reports how many drives/files still depend on the legacy server-held key.
 * The cleanup (drop Webhook.encKey, legacy chunk finalize, file-server-crypto.ts) is only safe at zero.
 * Run: DATABASE_URL=… node scripts/e2ee-migration-status.mjs
 */
import pg from "pg";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const one = async (sql) => Number((await db.query(sql)).rows[0].n);
const out = {
  drivesTotal: await one(`select count(*)::int n from "Webhook"`),
  drivesNotMigrated: await one(`select count(*)::int n from "Webhook" where "e2eeVersion" = 0`),
  drivesStillHoldingServerKey: await one(`select count(*)::int n from "Webhook" where "encKey" is not null`),
  legacyEncryptedFiles: await one(`select count(*)::int n from "DriveFile" where "encIv" is not null and "cryptoVersion" = 0 and locked = false`),
  plaintextFiles: await one(`select count(*)::int n from "DriveFile" where "encIv" is null and "cryptoVersion" = 0 and locked = false and visibility = 'private'`),
};
console.table(out);
const ready = out.drivesNotMigrated === 0 && out.drivesStillHoldingServerKey === 0 && out.legacyEncryptedFiles === 0;
console.log(ready ? "READY: the legacy cleanup can ship." : "NOT READY: keep the legacy code paths and the encKey column.");
await db.end();
process.exit(ready ? 0 : 2);

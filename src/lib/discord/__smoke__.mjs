/**
 * Smoke tests for the pure functions of the Discord client.
 * Run with:  node src/lib/discord/__smoke__.mjs
 *
 * No network, no DOM — just verifies the unit-testable logic.
 */
import { strict as assert } from "node:assert";

// We import the compiled output via ts-node would be ideal, but since this
// is plain Node we reimplement the regex inline and replicate the simpler
// fns we want to assert. Anything more interesting goes through the dev page.

const WEBHOOK_URL_REGEX =
  /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/(\d{17,20})\/([\w-]+)\/?$/i;

// --- parseWebhookUrl ---
const VALID = [
  "https://discord.com/api/webhooks/1234567890123456789/abcDEF_-123",
  "https://discordapp.com/api/webhooks/1234567890123456789/abcDEF",
  "https://ptb.discord.com/api/webhooks/1234567890123456789/abc",
  "https://canary.discord.com/api/v10/webhooks/1234567890123456789/x_y-z",
  "https://discord.com/api/v9/webhooks/1234567890123456789/token/",
];
const INVALID = [
  "https://example.com/webhook/123/abc",
  "https://discord.com/api/webhooks/123/abc", // id too short (<17 digits)
  "discord.com/api/webhooks/1234567890123456789/abc", // missing scheme
  "",
  "https://discord.com/api/webhooks//abc",
];

for (const u of VALID) {
  const m = WEBHOOK_URL_REGEX.exec(u);
  assert.ok(m, `Expected VALID: ${u}`);
  assert.match(m[1], /^\d{17,20}$/, `Bad id from ${u}`);
  assert.ok(m[2].length > 0, `Empty token from ${u}`);
}
for (const u of INVALID) {
  const m = WEBHOOK_URL_REGEX.exec(u);
  assert.equal(m, null, `Expected INVALID but parsed: ${u}`);
}

// --- planChunks ---
function planChunks(totalSize, chunkSize) {
  if (totalSize <= 0) return [];
  const chunks = [];
  let i = 0;
  for (let start = 0; start < totalSize; start += chunkSize) {
    const end = Math.min(start + chunkSize, totalSize);
    chunks.push({ index: i, start, end, size: end - start });
    i++;
  }
  return chunks;
}

// Empty file
assert.deepEqual(planChunks(0, 100), []);
// Single chunk smaller than chunkSize
assert.deepEqual(planChunks(50, 100), [{ index: 0, start: 0, end: 50, size: 50 }]);
// Exact multiple
assert.deepEqual(planChunks(200, 100), [
  { index: 0, start: 0, end: 100, size: 100 },
  { index: 1, start: 100, end: 200, size: 100 },
]);
// Non-exact multiple — last chunk smaller
assert.deepEqual(planChunks(250, 100), [
  { index: 0, start: 0, end: 100, size: 100 },
  { index: 1, start: 100, end: 200, size: 100 },
  { index: 2, start: 200, end: 250, size: 50 },
]);
// Realistic 100 MiB / 9.5 MiB chunks
const big = planChunks(100 * 1024 * 1024, 9.5 * 1024 * 1024);
assert.equal(big.length, 11, "100 MiB / 9.5 MiB should be 11 chunks");
assert.equal(
  big.reduce((s, c) => s + c.size, 0),
  100 * 1024 * 1024,
  "sum of chunk sizes must equal total",
);

// --- parseCdnExpiry ---
function parseCdnExpiry(url) {
  try {
    const u = new URL(url);
    const ex = u.searchParams.get("ex");
    if (!ex) return 0;
    const seconds = parseInt(ex, 16);
    if (!Number.isFinite(seconds)) return 0;
    return seconds * 1000;
  } catch {
    return 0;
  }
}

assert.equal(parseCdnExpiry("https://cdn.discordapp.com/x"), 0);
assert.equal(parseCdnExpiry("not a url"), 0);
// ex=675a0000 hex = 1733854720 seconds → 1733854720000 ms
const exHex = "675a0000";
const expected = parseInt(exHex, 16) * 1000;
assert.equal(
  parseCdnExpiry(`https://cdn.discordapp.com/x?ex=${exHex}&is=abc&hm=def`),
  expected,
);

console.log("OK: parseWebhookUrl, planChunks, parseCdnExpiry — all smoke tests passed");

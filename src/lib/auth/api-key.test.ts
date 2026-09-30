import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_KEY_FORMAT,
  checkKeyRestrictions,
  expiryFromDays,
  generateApiKey,
  hashApiKey,
  normalizeIp,
  sanitizeAllowedIps,
  sanitizeScopes,
} from "./api-key.ts";

test("generated keys match the public format and hash deterministically", () => {
  const { raw, prefix, hash } = generateApiKey();
  assert.match(raw, API_KEY_FORMAT);
  assert.ok(raw.startsWith(prefix));
  assert.equal(hash, hashApiKey(raw));
  assert.notEqual(generateApiKey().raw, raw);
});

test("key format rejects malformed input", () => {
  for (const bad of ["", "dvc_", "dvc_short", `dvc_${"a".repeat(33)}`, `xxx_${"a".repeat(32)}`, `dvc_${"a".repeat(31)}!`]) {
    assert.doesNotMatch(bad, API_KEY_FORMAT);
  }
});

test("scopes: known only, deduped, least-privilege default", () => {
  assert.deepEqual(sanitizeScopes(["read", "write", "read", "root"]), ["read", "write"]);
  assert.deepEqual(sanitizeScopes(["delete", "share"]), ["delete", "share"]);
  assert.deepEqual(sanitizeScopes(undefined), ["read"]);
  assert.deepEqual(sanitizeScopes([]), ["read"]);
  assert.deepEqual(sanitizeScopes(["nope"]), ["read"]);
});

test("IP allowlist input", () => {
  assert.deepEqual(sanitizeAllowedIps(undefined), []);
  assert.deepEqual(sanitizeAllowedIps([" 203.0.113.7 ", "203.0.113.7", "2001:DB8::1", ""]), ["203.0.113.7", "2001:db8::1"]);
  assert.equal(sanitizeAllowedIps(["not-an-ip"]), null);
  assert.equal(sanitizeAllowedIps(["10.0.0.0/8"]), null);
  assert.equal(sanitizeAllowedIps("1.1.1.1"), null);
  assert.equal(sanitizeAllowedIps(Array.from({ length: 11 }, (_, i) => `10.0.0.${i}`)), null);
});

test("expiry input", () => {
  const now = Date.UTC(2026, 8, 30);
  assert.equal(expiryFromDays(undefined, now), undefined);
  assert.equal(expiryFromDays(null, now), undefined);
  assert.equal(expiryFromDays(30, now)?.getTime(), now + 30 * 86_400_000);
  for (const bad of [0, -1, 366, 1.5, "30", NaN]) assert.equal(expiryFromDays(bad, now), null);
});

test("restrictions: expiry and IP", () => {
  const now = Date.UTC(2026, 8, 30);
  const open = { expiresAt: null, allowedIps: [] };
  assert.equal(checkKeyRestrictions(open, "1.2.3.4", now), null);
  assert.equal(checkKeyRestrictions({ ...open, expiresAt: new Date(now - 1) }, "1.2.3.4", now), "expired");
  assert.equal(checkKeyRestrictions({ ...open, expiresAt: new Date(now) }, "1.2.3.4", now), "expired");
  assert.equal(checkKeyRestrictions({ ...open, expiresAt: new Date(now + 1) }, "1.2.3.4", now), null);

  const locked = { expiresAt: null, allowedIps: ["203.0.113.7"] };
  assert.equal(checkKeyRestrictions(locked, "203.0.113.7", now), null);
  assert.equal(checkKeyRestrictions(locked, "::ffff:203.0.113.7", now), null);
  assert.equal(checkKeyRestrictions(locked, "203.0.113.8", now), "ip_not_allowed");
  assert.equal(checkKeyRestrictions(locked, "unknown", now), "ip_not_allowed");
});

test("normalizeIp", () => {
  assert.equal(normalizeIp("::FFFF:1.2.3.4"), "1.2.3.4");
  assert.equal(normalizeIp("2001:DB8::A"), "2001:db8::a");
});

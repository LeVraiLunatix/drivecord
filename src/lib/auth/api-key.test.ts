import { describe, expect, it } from "vitest";
import {
  checkKeyRestrictions,
  crc32,
  effectiveScopes,
  expiryFromDays,
  generateApiKey,
  hashApiKey,
  isWellFormedApiKey,
  keyHasScope,
  normalizeIp,
  sanitizeAllowedIps,
  sanitizeAllowedOrigins,
  sanitizeScopes,
} from "./api-key";

describe("key format", () => {
  it("crc32 matches the reference vector", () => {
    expect(crc32("123456789")).toBe(0xcbf43926);
    expect(crc32("")).toBe(0);
  });

  it("generated keys are 256-bit, checksummed, and hash deterministically", () => {
    const { raw, prefix, hash } = generateApiKey();
    expect(raw).toMatch(/^dvc_[A-Za-z0-9_-]{43}_[0-9a-f]{8}$/);
    expect(isWellFormedApiKey(raw)).toBe(true);
    expect(raw.startsWith(prefix)).toBe(true);
    expect(hash).toBe(hashApiKey(raw));
    expect(generateApiKey().raw).not.toBe(raw);
  });

  it("rejects a typo or truncation via the checksum, before any DB lookup", () => {
    const { raw } = generateApiKey();
    const flipped = raw.slice(0, 10) + (raw[10] === "a" ? "b" : "a") + raw.slice(11);
    expect(isWellFormedApiKey(flipped)).toBe(false);
    expect(isWellFormedApiKey(raw.slice(0, -1))).toBe(false);
    expect(isWellFormedApiKey(`${raw}0`)).toBe(false);
  });

  it("still accepts the legacy format, and nothing else", () => {
    expect(isWellFormedApiKey(`dvc_${"a".repeat(32)}`)).toBe(true);
    for (const bad of ["", "dvc_", "dvc_short", `dvc_${"a".repeat(33)}`, `xxx_${"a".repeat(32)}`, `dvc_${"a".repeat(31)}!`]) {
      expect(isWellFormedApiKey(bad)).toBe(false);
    }
  });
});

describe("scopes", () => {
  it("legacy read/write expand per the compatibility table", () => {
    expect([...effectiveScopes(["read"])]).toEqual(["files:read"]);
    expect([...effectiveScopes(["write"])].sort()).toEqual(
      ["files:delete", "files:write", "folders:write", "public:manage"],
    );
    expect(keyHasScope({ scopes: ["read"] }, "public:manage")).toBe(false);
    expect(keyHasScope({ scopes: ["write"] }, "files:read")).toBe(false);
    expect(keyHasScope({ scopes: ["read", "write"] }, "files:read")).toBe(true);
  });

  it("new scopes are exact, unknown ones grant nothing", () => {
    expect(keyHasScope({ scopes: ["files:write"] }, "files:delete")).toBe(false);
    expect(keyHasScope({ scopes: ["files:delete"] }, "files:delete")).toBe(true);
    expect(effectiveScopes(["root", "*", ""]).size).toBe(0);
  });

  it("sanitize: known only, deduped, least-privilege default", () => {
    expect(sanitizeScopes(["files:read", "files:write", "files:read", "root"])).toEqual(["files:read", "files:write"]);
    expect(sanitizeScopes(undefined)).toEqual(["files:read"]);
    expect(sanitizeScopes([])).toEqual(["files:read"]);
    expect(sanitizeScopes(["read", "write"])).toEqual(["files:read"]); // legacy names are not minted any more
  });
});

describe("allowlists", () => {
  it("IPs", () => {
    expect(sanitizeAllowedIps(undefined)).toEqual([]);
    expect(sanitizeAllowedIps([" 203.0.113.7 ", "203.0.113.7", "2001:DB8::1", ""])).toEqual(["203.0.113.7", "2001:db8::1"]);
    expect(sanitizeAllowedIps(["not-an-ip"])).toBeNull();
    expect(sanitizeAllowedIps(["10.0.0.0/8"])).toBeNull();
    expect(sanitizeAllowedIps("1.1.1.1")).toBeNull();
    expect(sanitizeAllowedIps(Array.from({ length: 11 }, (_, i) => `10.0.0.${i}`))).toBeNull();
  });

  it("origins: exact https origins only (http only for localhost)", () => {
    expect(sanitizeAllowedOrigins(["https://wavecast.fm", "https://wavecast.fm/", "http://localhost:3000"])).toEqual([
      "https://wavecast.fm",
      "http://localhost:3000",
    ]);
    for (const bad of ["http://wavecast.fm", "https://wavecast.fm/path", "wavecast.fm", "*", "https://u:p@x.fm", "javascript:1"]) {
      expect(sanitizeAllowedOrigins([bad])).toBeNull();
    }
    expect(sanitizeAllowedOrigins(undefined)).toEqual([]);
  });

  it("normalizeIp", () => {
    expect(normalizeIp("::FFFF:1.2.3.4")).toBe("1.2.3.4");
    expect(normalizeIp("2001:DB8::A")).toBe("2001:db8::a");
  });
});

describe("expiry input", () => {
  const now = Date.UTC(2026, 8, 30);
  it("converts days", () => {
    expect(expiryFromDays(undefined, now)).toBeUndefined();
    expect(expiryFromDays(null, now)).toBeUndefined();
    expect(expiryFromDays(30, now)?.getTime()).toBe(now + 30 * 86_400_000);
  });
  it.each([0, -1, 366, 1.5, "30", NaN])("rejects %s", (bad) => {
    expect(expiryFromDays(bad, now)).toBeNull();
  });
});

describe("checkKeyRestrictions", () => {
  const now = Date.UTC(2026, 8, 30);
  const open = { expiresAt: null, revokedAt: null, allowedIps: [], allowedOrigins: [] };
  const ctx = { ip: "1.2.3.4", origin: null };

  it("open key passes", () => expect(checkKeyRestrictions(open, ctx, now)).toBeNull());

  it("revoked beats everything", () => {
    expect(checkKeyRestrictions({ ...open, revokedAt: new Date(now - 1) }, ctx, now)).toBe("revoked");
  });

  it("expiry is exclusive of the deadline itself", () => {
    expect(checkKeyRestrictions({ ...open, expiresAt: new Date(now - 1) }, ctx, now)).toBe("expired");
    expect(checkKeyRestrictions({ ...open, expiresAt: new Date(now) }, ctx, now)).toBe("expired");
    expect(checkKeyRestrictions({ ...open, expiresAt: new Date(now + 1) }, ctx, now)).toBeNull();
  });

  it("IP allowlist (incl. IPv4-mapped IPv6)", () => {
    const k = { ...open, allowedIps: ["203.0.113.7"] };
    expect(checkKeyRestrictions(k, { ...ctx, ip: "203.0.113.7" }, now)).toBeNull();
    expect(checkKeyRestrictions(k, { ...ctx, ip: "::ffff:203.0.113.7" }, now)).toBeNull();
    expect(checkKeyRestrictions(k, { ...ctx, ip: "203.0.113.8" }, now)).toBe("ip_not_allowed");
    expect(checkKeyRestrictions(k, { ...ctx, ip: "unknown" }, now)).toBe("ip_not_allowed");
  });

  it("origin allowlist only constrains browser requests", () => {
    const k = { ...open, allowedOrigins: ["https://wavecast.fm"] };
    expect(checkKeyRestrictions(k, { ...ctx, origin: null }, now)).toBeNull(); // server-to-server
    expect(checkKeyRestrictions(k, { ...ctx, origin: "https://wavecast.fm" }, now)).toBeNull();
    expect(checkKeyRestrictions(k, { ...ctx, origin: "https://evil.example" }, now)).toBe("origin_not_allowed");
    expect(checkKeyRestrictions(k, { ...ctx, origin: "null" }, now)).toBe("origin_not_allowed");
    expect(checkKeyRestrictions(open, { ...ctx, origin: "https://anything.example" }, now)).toBeNull();
  });
});

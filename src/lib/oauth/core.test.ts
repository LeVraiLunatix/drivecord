import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  APP_ID_FORMAT,
  generateAppId,
  generateToken,
  hashToken,
  isSubset,
  isValidCodeChallenge,
  parseScopes,
  redirectUriMatches,
  tokenKindOf,
  validateOrigin,
  validateRedirectUri,
  verifyPkce,
  withParams,
} from "./core";

const challengeOf = (v: string) => crypto.createHash("sha256").update(v).digest("base64url");

describe("tokens", () => {
  it("are prefixed, 256-bit, distinct, and hash deterministically", () => {
    for (const [kind, prefix] of [["at", "dvc_at_"], ["rt", "dvc_rt_"], ["cs", "dvc_cs_"], ["code", "dvc_ac_"]] as const) {
      const a = generateToken(kind);
      expect(a.raw.startsWith(prefix)).toBe(true);
      expect(a.raw.length).toBe(prefix.length + 43);
      expect(a.hash).toBe(hashToken(a.raw));
      expect(generateToken(kind).raw).not.toBe(a.raw);
      expect(tokenKindOf(a.raw)).toBe(kind);
    }
  });
  it("tokenKindOf rejects malformed input", () => {
    for (const bad of ["", "dvc_at_short", "dvc_xx_" + "a".repeat(43), "Bearer x", "dvc_at_" + "a".repeat(44), "dvc_at_" + "!".repeat(43)]) {
      expect(tokenKindOf(bad)).toBeNull();
    }
  });
});

describe("scopes", () => {
  it("parses, dedupes, rejects unknown", () => {
    expect(parseScopes("app_folder:write profile:basic app_folder:write")).toEqual(["app_folder:write", "profile:basic"]);
    expect(parseScopes("app_folder:write drive:all")).toBeNull();
    expect(parseScopes("")).toBeNull();
    expect(parseScopes(null)).toBeNull();
    expect(parseScopes("*")).toBeNull();
  });
  it("no scope exposes keys or the rest of the drive", () => {
    expect(parseScopes("keys:read")).toBeNull();
    expect(parseScopes("files:read")).toBeNull();
  });
  it("isSubset", () => {
    expect(isSubset(["a"], ["a", "b"])).toBe(true);
    expect(isSubset(["a", "c"], ["a", "b"])).toBe(false);
  });
});

describe("PKCE (S256 only)", () => {
  const verifier = crypto.randomBytes(48).toString("base64url");
  it("accepts the matching verifier", () => expect(verifyPkce(verifier, challengeOf(verifier))).toBe(true));
  it("rejects a different verifier", () => expect(verifyPkce(crypto.randomBytes(48).toString("base64url"), challengeOf(verifier))).toBe(false));
  it("rejects `plain` (challenge == verifier)", () => expect(verifyPkce(verifier, verifier.slice(0, 43))).toBe(false));
  it("rejects malformed / short / non-string verifiers", () => {
    expect(verifyPkce("short", challengeOf("short"))).toBe(false);
    expect(verifyPkce(undefined, challengeOf(verifier))).toBe(false);
    expect(verifyPkce("a".repeat(129), challengeOf("a".repeat(129)))).toBe(false);
    expect(verifyPkce(`${verifier}!`, challengeOf(`${verifier}!`))).toBe(false);
  });
  it("challenge format", () => {
    expect(isValidCodeChallenge(challengeOf(verifier))).toBe(true);
    for (const bad of ["", "x", "a".repeat(44), undefined, 5]) expect(isValidCodeChallenge(bad)).toBe(false);
  });
});

describe("redirect URIs", () => {
  const registered = ["https://app.example/cb", "http://localhost:3000/cb"];
  it("match is EXACT", () => {
    expect(redirectUriMatches(registered, "https://app.example/cb")).toBe(true);
    for (const bad of ["https://app.example/cb/", "https://app.example/cb?x=1", "https://app.example/cb#f", "https://app.example", "https://evil.example/cb", "https://app.example.evil.example/cb", "HTTPS://APP.EXAMPLE/cb", "https://app.example/cbx"]) {
      expect(redirectUriMatches(registered, bad)).toBe(false);
    }
  });
  it("registration: https or loopback http, no fragment / credentials / exotic schemes", () => {
    for (const ok of ["https://a.example/cb", "http://localhost:3000/cb", "http://127.0.0.1:8080/cb"]) expect(validateRedirectUri(ok)).toBe(true);
    for (const bad of ["http://a.example/cb", "javascript:alert(1)", "data:text/html,x", "https://a.example/cb#x", "https://u:p@a.example/cb", "ftp://a.example", "nope", "file:///etc/passwd", `https://a.example/${"a".repeat(2100)}`]) {
      expect(validateRedirectUri(bad)).toBe(false);
    }
  });
  it("origins", () => {
    expect(validateOrigin("https://site.example")).toBe(true);
    expect(validateOrigin("http://localhost:3000")).toBe(true);
    for (const bad of ["https://site.example/", "https://site.example/path", "http://site.example", "*", "null", "site.example"]) expect(validateOrigin(bad)).toBe(false);
  });
  it("withParams keeps existing query and adds ours", () => {
    const u = new URL(withParams("https://a.example/cb?keep=1", { code: "c", state: "s", iss: undefined }));
    expect(u.searchParams.get("keep")).toBe("1");
    expect(u.searchParams.get("code")).toBe("c");
    expect(u.searchParams.get("state")).toBe("s");
    expect(u.searchParams.has("iss")).toBe(false);
  });
});

describe("app ids", () => {
  it("are well-formed and unique", () => {
    const a = generateAppId();
    expect(a).toMatch(APP_ID_FORMAT);
    expect(generateAppId()).not.toBe(a);
  });
});

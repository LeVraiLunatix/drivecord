import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canUnlinkCord,
  cordAuthParams,
  cordAuthParamsFromQuery,
  cordLoginHint,
  cordIdentityFromIdToken,
  cordPortalUrl,
  isCordAvatar,
  loginErrorMessage,
  nextImageAfterCord,
  shouldOpenOtherMethods,
} from "./cord-shared.ts";

const ISSUER = "https://compte.cordsuite.app";
const AV1 = `${ISSUER}/avatar/u1?v=aaa`;
const AV2 = `${ISSUER}/avatar/u1?v=bbb`;

test("cordPortalUrl builds section deep links", () => {
  assert.equal(cordPortalUrl(undefined, "apps"), null);
  assert.equal(cordPortalUrl("https://compte.cordsuite.app", "security"), "https://compte.cordsuite.app/#securite");
  assert.equal(cordPortalUrl("https://compte.cordsuite.app", "overview"), "https://compte.cordsuite.app/#apercu");
  assert.equal(cordPortalUrl("https://compte.cordsuite.app/", "devices"), "https://compte.cordsuite.app/#appareils");
  assert.equal(cordPortalUrl("https://compte.cordsuite.app/#x", "apps"), "https://compte.cordsuite.app/#apps");
  assert.equal(cordPortalUrl("https://compte.cordsuite.app"), "https://compte.cordsuite.app/");
});

test("isCordAvatar only matches the issuer's avatar path", () => {
  assert.equal(isCordAvatar(AV1, ISSUER), true);
  assert.equal(isCordAvatar(AV1, `${ISSUER}/`), true);
  assert.equal(isCordAvatar("https://cdn.discordapp.com/avatars/1/a.png", ISSUER), false);
  assert.equal(isCordAvatar(null, ISSUER), false);
  assert.equal(isCordAvatar(AV1, undefined), false);
});

test("nextImageAfterCord fills empty avatars and never overrides a foreign one", () => {
  assert.equal(nextImageAfterCord(null, AV1, ISSUER), AV1);
  assert.equal(nextImageAfterCord(null, undefined, ISSUER), undefined);
  assert.equal(nextImageAfterCord("https://cdn.discordapp.com/x.png", AV1, ISSUER), undefined);
  assert.equal(nextImageAfterCord(AV1, AV2, ISSUER), AV2, "Cord photo changed → refresh");
  assert.equal(nextImageAfterCord(AV1, AV1, ISSUER), undefined, "unchanged → no write");
  assert.equal(nextImageAfterCord(AV1, undefined, ISSUER), null, "Cord photo removed → clear");
  assert.equal(nextImageAfterCord(null, "https://evil.example/x.png", ISSUER), undefined, "issuer avatars only");
  assert.equal(nextImageAfterCord(AV1, "https://evil.example/x.png", ISSUER), null);
});

test("cordIdentityFromIdToken reads name/email (UTF-8) from the payload", () => {
  const payload = Buffer.from(JSON.stringify({ sub: "u1", name: "Élodie Ç", email: "e@x.fr" })).toString("base64url");
  assert.deepEqual(cordIdentityFromIdToken(`h.${payload}.s`), { name: "Élodie Ç", email: "e@x.fr" });
  assert.equal(cordIdentityFromIdToken(null), null);
  assert.equal(cordIdentityFromIdToken("garbage"), null);
  assert.equal(cordIdentityFromIdToken("a.!!!.c"), null);
});

test("canUnlinkCord requires another way to sign in", () => {
  assert.equal(canUnlinkCord({ hasPassword: false, passkeyCount: 0, providers: ["cord"] }), false);
  assert.equal(canUnlinkCord({ hasPassword: false, passkeyCount: 0, providers: ["cord", "patreon"] }), false);
  assert.equal(canUnlinkCord({ hasPassword: true, passkeyCount: 0, providers: ["cord"] }), true);
  assert.equal(canUnlinkCord({ hasPassword: false, passkeyCount: 1, providers: ["cord"] }), true);
  assert.equal(canUnlinkCord({ hasPassword: false, passkeyCount: 0, providers: ["cord", "discord"] }), true);
});

test("loginErrorMessage explains Cord errors in French", () => {
  assert.equal(loginErrorMessage(null, "cord"), null);
  assert.match(loginErrorMessage("OAuthAccountNotLinked", "cord")!.description, /associe Cord dans Réglages/);
  assert.match(loginErrorMessage("OAuthCallbackError", "cord")!.title, /annulée/);
  const unverified = loginErrorMessage("CordEmailNotVerified", "cord", "https://compte.cordsuite.app/");
  assert.equal(unverified!.action?.href, "https://compte.cordsuite.app/");
  assert.equal(loginErrorMessage("Configuration", "google")!.title, "Connexion impossible");
});

test("cordAuthParams: prompt=create and a valid login_hint only", () => {
  assert.deepEqual(cordAuthParams({}), {});
  assert.deepEqual(cordAuthParams({ create: true }), { prompt: "create" });
  assert.deepEqual(cordAuthParams({ create: true, email: "  Toi@Example.com " }), {
    prompt: "create",
    login_hint: "Toi@Example.com",
  });
  assert.deepEqual(cordAuthParams({ email: "pas-un-email" }), {});
  assert.deepEqual(cordAuthParams({ email: `${"a".repeat(250)}@b.fr` }), {});
  assert.equal(cordLoginHint(null), null);
});

test("cordAuthParamsFromQuery ignores unknown prompts", () => {
  const q = (s: string) => new URLSearchParams(s);
  assert.deepEqual(cordAuthParamsFromQuery(q("provider=cord&prompt=create&login_hint=a%40b.fr")), {
    prompt: "create",
    login_hint: "a@b.fr",
  });
  assert.deepEqual(cordAuthParamsFromQuery(q("prompt=consent&login_hint=")), {});
});

test("shouldOpenOtherMethods", () => {
  const open = (error: string | null, provider: string | null, lastMethod: string | null) =>
    shouldOpenOtherMethods({ error, provider, lastMethod });
  // Nothing special: Cord first, others folded.
  assert.equal(open(null, null, null), false);
  assert.equal(open(null, null, "cord"), false);
  // Used another method last time.
  for (const m of ["google", "discord", "passkey", "credentials"]) assert.equal(open(null, null, m), true);
  // Errors about the other methods.
  assert.equal(open("CredentialsSignin", null, null), true);
  assert.equal(open("AccessDenied", "google", null), true);
  assert.equal(open("OAuthCallbackError", "discord", "cord"), true);
  // Cord says « use your usual method, then link Cord ».
  assert.equal(open("OAuthAccountNotLinked", "cord", "cord"), true);
  // Cord-only errors keep the focus on Cord.
  assert.equal(open("CordEmailNotVerified", "cord", null), false);
  assert.equal(open("AccessDenied", "cord", null), false);
  assert.equal(open("Configuration", "cord", null), false);
});

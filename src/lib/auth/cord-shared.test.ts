import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canUnlinkCord,
  cordIdentityFromIdToken,
  cordPortalUrl,
  isCordAvatar,
  loginErrorMessage,
  nextImageAfterCord,
} from "./cord-shared.ts";

const ISSUER = "https://compte.cordsuite.app";
const AV1 = `${ISSUER}/avatar/u1?v=aaa`;
const AV2 = `${ISSUER}/avatar/u1?v=bbb`;

test("cordPortalUrl builds section deep links", () => {
  assert.equal(cordPortalUrl(undefined, "apps"), null);
  assert.equal(cordPortalUrl("https://compte.cordsuite.app", "security"), "https://compte.cordsuite.app/#securite");
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

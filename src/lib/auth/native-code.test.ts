import { test } from "vitest";
import assert from "node:assert/strict";
import { isNativeNonce, mintNativeCode, verifyNativeCode } from "./native-code.ts";
import { newNativeNonce, takeNativeNonce } from "./native-nonce.ts";

process.env.AUTH_SECRET ??= "test-secret";

test("the app's nonce matches the code minted for it, once", async () => {
  const nonce = newNativeNonce();
  assert.ok(isNativeNonce(nonce));
  const code = mintNativeCode("user_1", nonce);

  // What the app does on drivecord://auth?code=… : find its nonce, exchange.
  const found = await takeNativeNonce(code);
  assert.equal(found, nonce);
  assert.equal(verifyNativeCode(code, found), "user_1");
  // A nonce serves a single sign-in.
  assert.equal(await takeNativeNonce(code), null);
});

test("a handoff code is useless without the app's nonce", () => {
  const code = mintNativeCode("user_1", newNativeNonce());
  assert.equal(verifyNativeCode(code, null), null);
  assert.equal(verifyNativeCode(code, ""), null);
  assert.equal(verifyNativeCode(code, newNativeNonce()), null);
});

test("tampered codes are rejected", () => {
  const nonce = newNativeNonce();
  const [payload, sig] = mintNativeCode("user_1", nonce).split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: Date.now() + 60_000, nh: "x" })).toString("base64url");
  assert.equal(verifyNativeCode(`${forged}.${sig}`, nonce), null);
  assert.equal(verifyNativeCode(`${payload}.${sig.slice(1)}x`, nonce), null);
  assert.equal(verifyNativeCode("garbage", nonce), null);
});

test("pending sign-ins are kept apart", async () => {
  const a = newNativeNonce();
  const b = newNativeNonce();
  const codeA = mintNativeCode("user_a", a);
  const codeB = mintNativeCode("user_b", b);
  assert.equal(await takeNativeNonce(codeB), b);
  assert.equal(await takeNativeNonce(codeA), a);
});

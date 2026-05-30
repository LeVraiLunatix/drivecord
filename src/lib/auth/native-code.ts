/**
 * One-time handoff codes for native (app) OAuth.
 *
 * After OAuth completes in the system browser, the server mints a short-lived
 * HMAC-signed code embedding the user id. The app deep-links back, then its
 * WebView exchanges the code for a real session cookie.
 *
 * The code is stateless (no DB): payload + HMAC-SHA256(payload, AUTH_SECRET),
 * with a 2-minute expiry. Short-lived + signed is enough for a handoff token.
 */
import crypto from "crypto";

const TTL_MS = 2 * 60 * 1000;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payload: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Mint a one-time code for `userId`. */
export function mintNativeCode(userId: string): string {
  const body = JSON.stringify({ uid: userId, exp: Date.now() + TTL_MS });
  const payload = b64url(Buffer.from(body));
  return `${payload}.${sign(payload)}`;
}

/** Verify a code; returns the userId or null if invalid/expired. */
export function verifyNativeCode(code: string): string | null {
  try {
    const [payload, sig] = code.split(".");
    if (!payload || !sig) return null;
    // Constant-time compare.
    const expected = sign(payload);
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return null;
    }
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof uid !== "string" || typeof exp !== "number") return null;
    if (Date.now() > exp) return null;
    return uid;
  } catch {
    return null;
  }
}

/**
 * One-time handoff codes for native (app) OAuth.
 *
 * After OAuth completes in the system browser, the server mints a short-lived
 * HMAC-signed code embedding the user id. The app deep-links back, then its
 * WebView exchanges the code for a real session cookie.
 *
 * The code is stateless (no DB): payload + HMAC-SHA256(payload, AUTH_SECRET),
 * with a 2-minute expiry.
 *
 * It is also bound to a secret nonce the APP generated and kept: the code only
 * carries SHA-256(nonce), and the exchange needs the nonce itself. Custom URL
 * schemes aren't exclusive on iOS — any app can register `drivecord://` and
 * receive the deep link — so a code alone must not be enough to sign in.
 */
import crypto from "crypto";

const TTL_MS = 2 * 60 * 1000;

/** Shape of the nonce the app sends (base64url, see src/lib/auth/native-nonce.ts). */
const NONCE_RE = /^[A-Za-z0-9_-]{22,128}$/;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payload: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** True for a well-formed app nonce. */
export function isNativeNonce(value: unknown): value is string {
  return typeof value === "string" && NONCE_RE.test(value);
}

/** SHA-256 of the nonce, as embedded in the code. */
export function nonceHash(nonce: string): string {
  return b64url(crypto.createHash("sha256").update(nonce).digest());
}

/** Mint a one-time code for `userId`, bound to the app's `nonce`. */
export function mintNativeCode(userId: string, nonce: string): string {
  const body = JSON.stringify({ uid: userId, exp: Date.now() + TTL_MS, nh: nonceHash(nonce) });
  const payload = b64url(Buffer.from(body));
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a code against the nonce the app holds; returns the userId or null
 * if invalid, expired, or presented without the matching nonce.
 */
export function verifyNativeCode(code: string, nonce: string | null | undefined): string | null {
  try {
    if (!isNativeNonce(nonce)) return null;
    const [payload, sig] = code.split(".");
    if (!payload || !sig) return null;
    if (!safeEqual(sig, sign(payload))) return null;
    const { uid, exp, nh } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof uid !== "string" || typeof exp !== "number" || typeof nh !== "string") return null;
    if (Date.now() > exp) return null;
    if (!safeEqual(nh, nonceHash(nonce))) return null;
    return uid;
  } catch {
    return null;
  }
}

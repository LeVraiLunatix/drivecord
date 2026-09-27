/**
 * One-time handoff codes for native (app) OAuth.
 *
 * After OAuth completes in the system browser, the server mints a short-lived
 * HMAC-signed code embedding the user id. The app deep-links back, then its
 * WebView exchanges the code for a real session cookie.
 *
 * The code itself is a stateless, HMAC-signed payload (payload +
 * HMAC-SHA256(payload, AUTH_SECRET)) with a 2-minute expiry — but a valid
 * signature only proves the code was minted by us, not that it hasn't been
 * replayed. `verifyNativeCode` therefore also *consumes* it server-side (see
 * `UsedNativeCode`): the first successful verification wins, every replay
 * within the 2-minute window afterwards is rejected.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

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

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Verify a code AND consume it (one-time use). Returns the userId, or null
 * if the signature/expiry is invalid, or the code was already used.
 *
 * The consume step is a single unique insert into `UsedNativeCode`: the first
 * caller to succeed wins the race, every other caller (including a genuine
 * concurrent retry) gets a unique-constraint violation and is rejected. This
 * is what actually makes the code one-time — the HMAC signature alone only
 * proves authenticity, not freshness.
 */
export async function verifyNativeCode(code: string): Promise<string | null> {
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

    try {
      await prisma.usedNativeCode.create({
        data: { codeHash: hashCode(code), expiresAt: new Date(exp) },
      });
    } catch {
      // Unique constraint violation (Prisma P2002) = this code was already
      // consumed — reject the replay. Any other DB error fails closed too.
      return null;
    }

    // Best-effort, non-blocking cleanup of long-expired rows so the table
    // doesn't grow unbounded — never lets a slow delete hold up the response.
    void prisma.usedNativeCode
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - TTL_MS) } } })
      .catch(() => {});

    return uid;
  } catch {
    return null;
  }
}

/**
 * Server-side AES-256-GCM encryption for Discord webhook URLs.
 *
 * Webhook URLs are essentially API keys — anyone who holds one can post to the
 * Discord channel. We encrypt them before storing in the database so that even
 * a DB dump doesn't expose working webhooks.
 *
 * Key: ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 * Wire format (base64): iv(12) || authTag(16) || ciphertext(n)
 */

import crypto from "crypto";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptUrl(url: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV — recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptUrl(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

import crypto from "crypto";

/**
 * Server-side AES-256-GCM decryption of a file blob that was encrypted on the
 * client by `encryptBlob` (Web Crypto).
 *
 * Web Crypto's AES-GCM output is `ciphertext || authTag(16 bytes)`, and the
 * 12-byte IV is stored separately (base64) as the file's `encIv`. We only use
 * this for **public shares** of drive-key-encrypted files (never the vault,
 * whose PIN-derived key the server doesn't have).
 */
export function decryptFileBuffer(
  cipher: Buffer,
  keyB64: string,
  ivB64: string,
): Buffer {
  const key = Buffer.from(keyB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const tag = cipher.subarray(cipher.length - 16);
  const ciphertext = cipher.subarray(0, cipher.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

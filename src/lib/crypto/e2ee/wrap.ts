/**
 * Key wrapping: AES-256-GCM, random 96-bit IV, AAD = a context string that
 * binds the blob to its purpose and owner. Stored as `v1.<b64 iv>.<b64 ct+tag>`.
 *
 * Because the context is authenticated, a wrapped key cannot be moved to
 * another user / drive / file by a server that swaps rows around.
 */
import { b64decode, b64encode, bs, enc, randomBytes } from "./encoding";

const VERSION = "v1";

export const aad = {
  mk: (userId: string) => `drivecord:mk:v1:${userId}`,
  dk: (driveId: string) => `drivecord:dk:v1:${driveId}`,
  fk: (fileId: string) => `drivecord:fk:v1:${fileId}`,
  priv: (userId: string) => `drivecord:x25519:v1:${userId}`,
  vault: (userId: string) => `drivecord:vault:v1:${userId}`,
  share: (token: string) => `drivecord:share:v1:${token}`,
  chunk: (fileId: string, index: number) => `drivecord:chunk:v1:${fileId}:${index}`,
  meta: (fileId: string) => `drivecord:meta:v1:${fileId}`,
  folder: (folderId: string) => `drivecord:folder:v1:${folderId}`,
};

export async function importAesKey(raw: Uint8Array, extractable = false): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error("Clé AES-256 attendue (32 octets).");
  return crypto.subtle.importKey("raw", bs(raw), { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
}

export async function aesEncrypt(key: CryptoKey, iv: Uint8Array, plain: Uint8Array, context: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv), additionalData: bs(enc.encode(context)), tagLength: 128 }, key, bs(plain)),
  );
}

export async function aesDecrypt(key: CryptoKey, iv: Uint8Array, cipher: Uint8Array, context: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(iv), additionalData: bs(enc.encode(context)), tagLength: 128 }, key, bs(cipher)),
  );
}

/** Wrap `secret` under `kek`, bound to `context`. `iv` is for test vectors only. */
export async function wrap(kek: CryptoKey, secret: Uint8Array, context: string, iv: Uint8Array = randomBytes(12)): Promise<string> {
  if (iv.length !== 12) throw new Error("IV de 12 octets attendu.");
  const ct = await aesEncrypt(kek, iv, secret, context);
  return `${VERSION}.${b64encode(iv)}.${b64encode(ct)}`;
}

export async function unwrap(kek: CryptoKey, blob: string, context: string): Promise<Uint8Array> {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error("Format de clé enveloppée inconnu.");
  try {
    return await aesDecrypt(kek, b64decode(parts[1]!), b64decode(parts[2]!), context);
  } catch {
    // Wrong key, wrong context or tampering: deliberately indistinguishable.
    throw new Error("Déchiffrement impossible (mauvaise clé ou données altérées).");
  }
}

/**
 * Encrypted metadata: file names / types / sizes live in `encMeta`, folder
 * names in `encName`, so the server (and Discord) never sees them.
 */
import { b64decode, b64encode, dec, enc, randomBytes } from "./encoding";
import { aad, aesDecrypt, aesEncrypt } from "./wrap";

export type FileMeta = { name: string; mime: string; size: number; mtime?: number; sha256?: string };

async function seal(key: CryptoKey, plain: Uint8Array, context: string): Promise<string> {
  const iv = randomBytes(12);
  return `v1.${b64encode(iv)}.${b64encode(await aesEncrypt(key, iv, plain, context))}`;
}

async function open(key: CryptoKey, blob: string, context: string): Promise<Uint8Array> {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Format de métadonnées inconnu.");
  try {
    return await aesDecrypt(key, b64decode(parts[1]!), b64decode(parts[2]!), context);
  } catch {
    throw new Error("Métadonnées illisibles (mauvaise clé ou données altérées).");
  }
}

export async function encryptMeta(fk: CryptoKey, fileId: string, meta: FileMeta): Promise<string> {
  return seal(fk, enc.encode(JSON.stringify(meta)), aad.meta(fileId));
}

export async function decryptMeta(fk: CryptoKey, fileId: string, blob: string): Promise<FileMeta> {
  const meta = JSON.parse(dec.decode(await open(fk, blob, aad.meta(fileId)))) as Partial<FileMeta>;
  if (typeof meta.name !== "string" || typeof meta.mime !== "string" || typeof meta.size !== "number") {
    throw new Error("Métadonnées invalides.");
  }
  return meta as FileMeta;
}

export const encryptFolderName = (dk: CryptoKey, folderId: string, name: string) =>
  seal(dk, enc.encode(name), aad.folder(folderId));

export async function decryptFolderName(dk: CryptoKey, folderId: string, blob: string): Promise<string> {
  return dec.decode(await open(dk, blob, aad.folder(folderId)));
}

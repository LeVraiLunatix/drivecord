"use client";

/**
 * Per-file crypto for the web app: turn a server row (`fkWrapped`, `noncePrefix`, …) into
 * usable cipher parameters, decrypt downloaded blobs, and prepare encrypted uploads.
 */
import { nanoid } from "nanoid";
import {
  CHUNK_CIPHER,
  b64decode,
  b64encode,
  cipherSize,
  plainSize,
  createEncryptTransform,
  decryptBlob as decryptV1Blob,
  decryptMeta,
  encryptMeta,
  generateFileKey,
  importAesKey,
  unwrapFileKey,
  wrapFileKey,
  type FileCipherParams,
  type FileMeta,
} from "@/lib/crypto/e2ee";
import { decryptBlob as decryptLegacyBlob } from "@/lib/crypto/vault-crypto";
import type { FileEntry } from "@/lib/storage/schema";
import { getDriveKeyMaterialById, type DriveKeyMaterial } from "./drive-keys";

type V1File = Pick<FileEntry, "id" | "fkWrapped" | "noncePrefix" | "encMeta" | "cryptoVersion">;

const cipherCache = new Map<string, FileCipherParams & { raw: Uint8Array }>();
export const clearFileKeyCache = () => cipherCache.clear();

export const isE2eeFile = (f: { cryptoVersion?: number }) => (f.cryptoVersion ?? 0) >= 1;

/** Cipher parameters (FK, nonce prefix, file id) of a v1 file. */
export async function getFileCipher(dk: DriveKeyMaterial, file: V1File): Promise<FileCipherParams & { raw: Uint8Array }> {
  const hit = cipherCache.get(file.id);
  if (hit) return hit;
  if (!file.fkWrapped || !file.noncePrefix) throw new Error("Clé de fichier manquante.");
  const raw = await unwrapFileKey(dk.raw, file.id, file.fkWrapped);
  const p = { fk: await importAesKey(raw), noncePrefix: b64decode(file.noncePrefix), fileId: file.id, raw };
  cipherCache.set(file.id, p);
  return p;
}

export async function readFileMeta(dk: DriveKeyMaterial, file: V1File): Promise<FileMeta> {
  if (!file.encMeta) throw new Error("Métadonnées manquantes.");
  return decryptMeta((await getFileCipher(dk, file)).fk, file.id, file.encMeta);
}

/**
 * Decrypt a downloaded blob if the file is end-to-end encrypted (v1) or uses the legacy
 * single-IV format (encrypted directly with the drive key). Plaintext passes through.
 */
export async function decryptDownloaded(driveId: string, blob: Blob, file: FileEntry & { encIv?: string }): Promise<Blob> {
  if (isE2eeFile(file)) {
    const dk = await getDriveKeyMaterialById(driveId);
    const p = await getFileCipher(dk, file);
    const mime = (await readFileMeta(dk, file)).mime;
    return decryptV1Blob(blob, p, mime);
  }
  if (file.encIv) {
    const dk = await getDriveKeyMaterialById(driveId);
    return decryptLegacyBlob(blob, dk.key, file.encIv);
  }
  return blob;
}

// ── Upload ───────────────────────────────────────────────────────────────────

/** Anything we can read as a byte stream: a File/Blob, or a stream with a known size (camera roll). */
export type UploadSource = {
  stream(): ReadableStream<Uint8Array>;
  size: number;
  name?: string;
  type?: string;
  lastModified?: number;
};

export type PreparedUpload = {
  fileId: string;
  /** Ciphertext stream: exactly 8 MiB + 16 per chunk (one chunk = one Discord attachment). */
  stream: ReadableStream<Uint8Array>;
  cipherSize: number;
  chunkSize: number;
  /** Opaque name for Discord's attachment (`<fileId>.part<i>`): the real name never reaches it. */
  discordName: string;
  /** Call once the ciphertext is uploaded, with the uploaded ciphertext size: it fixes the true plaintext size. */
  finalize: (uploadedCipherBytes?: number) => Promise<{ fkWrapped: string; encMeta: string; noncePrefix: string }>;
};

export async function prepareEncryptedUpload(dk: DriveKeyMaterial, file: UploadSource): Promise<PreparedUpload> {
  const fileId = nanoid(21);
  const { fk, noncePrefix } = generateFileKey();
  const fkKey = await importAesKey(fk);
  const p: FileCipherParams = { fk: fkKey, noncePrefix, fileId };
  cipherCache.set(fileId, { ...p, raw: fk });
  return {
    fileId,
    stream: file.stream().pipeThrough(createEncryptTransform(p)),
    cipherSize: cipherSize(file.size),
    chunkSize: CHUNK_CIPHER,
    discordName: fileId,
    async finalize(uploadedCipherBytes) {
      return {
        fkWrapped: await wrapFileKey(dk.raw, fileId, fk),
        encMeta: await encryptMeta(fkKey, fileId, {
          name: file.name || "fichier",
          mime: file.type || "application/octet-stream",
          // The bytes actually uploaded are the truth (a streamed source may have lied about its size).
          size: uploadedCipherBytes !== undefined ? plainSize(uploadedCipherBytes) : file.size,
          mtime: file.lastModified,
        }),
        noncePrefix: b64encode(noncePrefix),
      };
    },
  };
}

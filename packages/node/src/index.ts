/**
 * @drivecord/node — server-side client for API v2 with a personal access token (`dvc_pat_…`).
 *
 * Drivecord's servers only ever hold ciphertext, so you also need the drive key (32 raw bytes, exported
 * from Drivecord › Paramètres › Chiffrement). Encryption/decryption uses the exact same code as the web app.
 *
 *   const dc = new DrivecordNode({ token: process.env.DRIVECORD_TOKEN!, driveKey });
 *   const { fileId } = await dc.upload({ name: "rapport.pdf", type: "application/pdf", data: bytes });
 *   const f = await dc.download(fileId);   // { name, type, data }
 */
import {
  b64decode, b64encode, cipherSize, decryptBlob, decryptChunks, decryptMeta, encryptBlobChunks, encryptMeta,
  generateFileKey, importAesKey, plainSize, unwrapFileKey, wrapFileKey, CHUNK_CIPHER,
} from "../../../src/lib/crypto/e2ee";

export type NodeOptions = { token: string; driveKey: Uint8Array; baseUrl?: string };
export type ApiFile = { id: string; parentId: string; size: number; chunkCount: number; encMeta: string | null; fkWrapped: string | null; noncePrefix: string | null; trashed: boolean; createdAt: string };

export class DrivecordError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = "DrivecordError"; }
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const newFileId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 21);

export class DrivecordNode {
  private base: string;
  constructor(private o: NodeOptions) {
    if (o.driveKey.length !== 32) throw new Error("driveKey doit faire 32 octets");
    this.base = (o.baseUrl ?? "https://drivecord.app").replace(/\/+$/, "") + "/api/v2";
  }

  async request<T>(method: string, path: string, body?: unknown, extra: RequestInit["headers"] = {}): Promise<T> {
    const isBin = body instanceof Uint8Array;
    const r = await fetch(this.base + path, {
      method,
      headers: { Authorization: `Bearer ${this.o.token}`, ...(body !== undefined && !isBin ? { "Content-Type": "application/json" } : {}), ...extra },
      body: body === undefined ? undefined : isBin ? (body as BodyInit) : JSON.stringify(body),
    });
    if (r.status === 204) return undefined as T;
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new DrivecordError(d.error?.message ?? `HTTP ${r.status}`, r.status, d.error?.code);
    return d as T;
  }

  me() { return this.request<{ principal: unknown; drive: { encrypted: boolean } }>("GET", "/me"); }

  async upload(f: { name: string; type?: string; data: Uint8Array | Blob; parentId?: string }): Promise<{ fileId: string }> {
    const blob = f.data instanceof Blob ? f.data : new Blob([f.data as BlobPart]);
    const fileId = newFileId();
    const { fk, noncePrefix } = generateFileKey();
    const fkKey = await importAesKey(fk);
    const total = cipherSize(blob.size);
    const s = await this.request<{ uploadId: string; chunkCount: number }>("POST", "/uploads", { fileId, size: total, ...(f.parentId !== undefined ? { parentId: f.parentId } : {}) }, { "Idempotency-Key": "up-" + fileId });
    try {
      let i = 0;
      for await (const chunk of encryptBlobChunks(blob, { fk: fkKey, noncePrefix, fileId })) {
        await this.request("PUT", `/uploads/${s.uploadId}/chunks/${i}`, chunk, { "Content-Type": "application/octet-stream", "X-Chunk-SHA256": hex(await crypto.subtle.digest("SHA-256", chunk as BufferSource)) });
        i++;
      }
      await this.request("POST", `/uploads/${s.uploadId}/complete`, {
        fkWrapped: await wrapFileKey(this.o.driveKey, fileId, fk),
        encMeta: await encryptMeta(fkKey, fileId, { name: f.name, mime: f.type ?? "application/octet-stream", size: blob.size, mtime: Date.now() }),
        noncePrefix: b64encode(noncePrefix),
      });
    } catch (e) {
      await this.request("DELETE", `/uploads/${s.uploadId}`).catch(() => {});
      throw e;
    }
    return { fileId };
  }

  private async cipherFor(file: ApiFile) {
    if (!file.fkWrapped || !file.noncePrefix || !file.encMeta) throw new DrivecordError("Fichier non chiffré ou incomplet.", 409);
    const fk = await importAesKey(await unwrapFileKey(this.o.driveKey, file.id, file.fkWrapped));
    return { fk, noncePrefix: b64decode(file.noncePrefix), fileId: file.id };
  }

  async list(opts: { parentId?: string; cursor?: string; limit?: number } = {}) {
    const q = new URLSearchParams(Object.entries(opts).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    const d = await this.request<{ files: ApiFile[]; nextCursor: string | null }>("GET", `/files?${q}`);
    const files = await Promise.all(d.files.map(async (f) => {
      try { const meta = await decryptMeta((await this.cipherFor(f)).fk, f.id, f.encMeta!); return { ...f, name: meta.name, type: meta.mime, plainSize: meta.size }; }
      catch { return { ...f, name: null as string | null, type: null as string | null, plainSize: plainSize(f.size) }; }
    }));
    return { files, nextCursor: d.nextCursor };
  }

  async download(fileId: string): Promise<{ name: string; type: string; data: Uint8Array }> {
    const file = await this.request<ApiFile>("GET", `/files/${fileId}`);
    const p = await this.cipherFor(file);
    const meta = await decryptMeta(p.fk, file.id, file.encMeta!);
    const parts: Blob[] = [];
    for (let i = 0; i < file.chunkCount; i++) {
      const r = await fetch(`${this.base}/files/${fileId}/chunks/${i}`, { headers: { Authorization: `Bearer ${this.o.token}` } });
      if (!r.ok) throw new DrivecordError(`Morceau ${i} indisponible (HTTP ${r.status})`, r.status);
      parts.push(new Blob([await r.arrayBuffer()]));
    }
    const plain = await decryptBlob(new Blob(parts), p);
    return { name: meta.name, type: meta.mime, data: new Uint8Array(await plain.arrayBuffer()) };
  }

  delete(fileId: string, opts: { permanent?: boolean } = {}) {
    return this.request<void>("DELETE", `/files/${fileId}${opts.permanent ? "?permanent=true" : ""}`);
  }
}

export { CHUNK_CIPHER, decryptChunks };
export default DrivecordNode;

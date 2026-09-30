/** Base64 / base64url / hex helpers that work identically in browsers and Node ≥ 20. */

export const enc = new TextEncoder();
export const dec = new TextDecoder();

function toBinary(bytes: Uint8Array): string {
  let s = "";
  // Chunked to stay clear of argument-count limits on large buffers.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return s;
}

export function b64encode(bytes: Uint8Array): string {
  return btoa(toBinary(bytes));
}

export function b64decode(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlEncode(bytes: Uint8Array): string {
  return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error("base64url invalide");
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  return b64decode(padded);
}

export function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexDecode(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error("hex invalide");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Constant-time-ish equality for small secrets (lengths are public). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** `BufferSource` view without the SharedArrayBuffer typing noise. */
export const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

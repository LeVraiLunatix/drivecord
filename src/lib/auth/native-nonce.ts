/**
 * App side of the native sign-in handoff (see src/lib/auth/native-code.ts).
 *
 * Before sending the user to Safari, the app makes a random nonce and keeps it
 * here (the WebView's storage, which no other app can read). The nonce goes
 * to Safari in the /native-login URL, the server binds the handoff code to its
 * hash, and only the app — which still has the nonce — can exchange the code
 * coming back through drivecord://.
 *
 * Generation is synchronous on purpose: `window.open` must run in the same tap.
 */

const KEY = "drivecord:native-nonces";
// Several pending sign-ins (the user tapped twice, came back, retried…).
const MAX = 5;

// Fallback when storage is unavailable (private mode / quota).
let memory: string[] = [];

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return memory;
  }
}

function write(list: string[]): void {
  memory = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* memory only */ }
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Create and remember a nonce for a new sign-in started from the app. */
export function newNativeNonce(): string {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(32)));
  write([...read(), nonce].slice(-MAX));
  return nonce;
}

/** `nh` (SHA-256 of the nonce) read from a handoff code's payload. */
function codeNonceHash(code: string): string | null {
  try {
    const payload = code.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return typeof json.nh === "string" ? json.nh : null;
  } catch {
    return null;
  }
}

/**
 * The stored nonce this handoff code was minted for (removed from storage:
 * a nonce serves once), or null if this app never started that sign-in.
 */
export async function takeNativeNonce(code: string): Promise<string | null> {
  const nh = codeNonceHash(code);
  if (!nh) return null;
  const list = read();
  for (const nonce of list) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
    if (b64url(new Uint8Array(digest)) === nh) {
      write(list.filter((n) => n !== nonce));
      return nonce;
    }
  }
  return null;
}

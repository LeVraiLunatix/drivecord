/**
 * postMessage protocol between a host page (SDK) and the Drivecord embed iframe. Pure types +
 * validators, shared by the app and the SDK bundle. Versioned: bump `EMBED_PROTOCOL` on breaking changes.
 *
 * Rules: the iframe only ever talks to an origin listed in the app's `allowedOrigins`, the host only
 * accepts messages whose `source` is the iframe window AND whose origin is the Drivecord origin, and
 * `uploaded` carries nothing but `{ fileId, size }` — never a name, URL or key.
 */
export const EMBED_PROTOCOL = 1;

export type HostMessage = { v: 1; source: "drivecord-host"; type: "init"; options: { multiple?: boolean; accept?: string } };

export type EmbedMessage =
  | { v: 1; source: "drivecord-embed"; type: "ready" }
  | { v: 1; source: "drivecord-embed"; type: "needs-auth" }
  | { v: 1; source: "drivecord-embed"; type: "locked" }
  | { v: 1; source: "drivecord-embed"; type: "progress"; fileId: string; percent: number }
  | { v: 1; source: "drivecord-embed"; type: "uploaded"; fileId: string; size: number }
  | { v: 1; source: "drivecord-embed"; type: "error"; code: string }
  | { v: 1; source: "drivecord-embed"; type: "resize"; height: number };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isObj(data) || data.v !== 1 || data.source !== "drivecord-host" || data.type !== "init") return null;
  const o = isObj(data.options) ? data.options : {};
  return {
    v: 1,
    source: "drivecord-host",
    type: "init",
    options: {
      multiple: o.multiple === true,
      accept: typeof o.accept === "string" && o.accept.length <= 200 && /^[\w.*/+,\- ]*$/.test(o.accept) ? o.accept : undefined,
    },
  };
}

export function parseEmbedMessage(data: unknown): EmbedMessage | null {
  if (!isObj(data) || data.v !== 1 || data.source !== "drivecord-embed" || typeof data.type !== "string") return null;
  switch (data.type) {
    case "ready":
    case "needs-auth":
    case "locked":
      return { v: 1, source: "drivecord-embed", type: data.type };
    case "progress":
      return typeof data.fileId === "string" && typeof data.percent === "number"
        ? { v: 1, source: "drivecord-embed", type: "progress", fileId: data.fileId, percent: Math.max(0, Math.min(100, data.percent)) }
        : null;
    case "uploaded":
      return typeof data.fileId === "string" && typeof data.size === "number"
        ? { v: 1, source: "drivecord-embed", type: "uploaded", fileId: data.fileId, size: data.size }
        : null;
    case "error":
      return typeof data.code === "string" ? { v: 1, source: "drivecord-embed", type: "error", code: data.code.slice(0, 64) } : null;
    case "resize":
      return typeof data.height === "number" && data.height >= 0 && data.height <= 4000 ? { v: 1, source: "drivecord-embed", type: "resize", height: Math.round(data.height) } : null;
    default:
      return null;
  }
}

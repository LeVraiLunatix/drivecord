/**
 * The ONE place that decides how file bytes are served over HTTP.
 *
 * Every route that returns user file content (API download, public links,
 * share pages…) must build its headers here. The threat: a user uploads
 * `evil.html` / `evil.svg` with a script in it, then a link to it is opened on
 * our own origin — the script runs with our cookies. So:
 *
 *  - only a short allowlist of passive media types may be shown `inline`;
 *  - everything else (HTML, SVG, XML, JS, …) is forced to a download with
 *    `application/octet-stream`, whatever type the uploader claimed;
 *  - `nosniff` + a locked-down CSP stop the browser from second-guessing us.
 */

const INLINE_EXACT = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
]);

/** Lower-case the media type and drop parameters (`text/html; charset=…`). */
export function normalizeMime(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0]!.trim().toLowerCase();
}

/** May this type be displayed inline in a browser without executing anything? */
export function isInlineSafe(mime: string | null | undefined): boolean {
  const m = normalizeMime(mime);
  if (INLINE_EXACT.has(m)) return true;
  // `audio/*` — but never a wildcard-looking or malformed value.
  return /^audio\/[a-z0-9][a-z0-9.+-]*$/.test(m);
}

/** Only pass through a well-formed `type/subtype`; anything else is unknown. */
export function isWellFormedMime(mime: string | null | undefined): boolean {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i.test(normalizeMime(mime));
}

function encodeRFC5987(s: string): string {
  return encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `Content-Disposition` safe against header injection and non-ASCII names. */
export function contentDisposition(filename: string, disposition: "inline" | "attachment"): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\;]/g, "_") || "download";
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeRFC5987(filename)}`;
}

export type SafeFileOptions = {
  /** What the caller would like. `inline` is honoured only for allowlisted types. */
  disposition: "inline" | "attachment";
  /** Served to third-party pages (hotlinks): relaxes framing for media, sets CORP. */
  isPublic?: boolean;
  cacheControl?: string;
};

export function buildSafeFileHeaders(
  file: { filename: string; mimeType: string; size?: number },
  opts: SafeFileOptions,
): Record<string, string> {
  const mime = normalizeMime(file.mimeType);
  const safe = isInlineSafe(mime);
  const inline = opts.disposition === "inline" && safe;
  const isMedia = /^(image|video|audio)\//.test(mime);

  // PDFs are opened by the browser's own viewer, which the CSP `sandbox`
  // directive would disable — every other type keeps the full sandbox.
  const csp =
    mime === "application/pdf" && inline
      ? "default-src 'none'; frame-ancestors 'none'"
      : `default-src 'none'; sandbox; frame-ancestors ${opts.isPublic && isMedia && inline ? "*" : "'none'"}`;

  return {
    "Content-Type": safe ? mime : "application/octet-stream",
    "Content-Disposition": contentDisposition(file.filename, inline ? "inline" : "attachment"),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": csp,
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": opts.isPublic ? "cross-origin" : "same-origin",
    ...(opts.cacheControl ? { "Cache-Control": opts.cacheControl } : {}),
    ...(file.size !== undefined ? { "Content-Length": String(file.size) } : {}),
  };
}

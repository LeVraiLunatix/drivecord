/** GET /api/v2/files/[id]/chunks/[index] — one chunk of ciphertext (or of the file itself when public). */
import { NextResponse } from "next/server";
import { BUCKETS, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { findFile, loadScope } from "@/lib/api-v2/drive";
import { fetchAndDecryptFile } from "@/lib/serve-file";
import type { ChunkRef } from "@/lib/discord";

export const runtime = "nodejs";
export const OPTIONS = preflight("GET, OPTIONS");

export const GET = v2Route<{ id: string; index: string }>(
  { cap: "read", bucket: BUCKETS.chunks, route: "/api/v2/files/[id]/chunks/[index]" },
  async ({ principal, params }) => {
    const scope = await loadScope(principal);
    const file = await findFile(scope, params.id);
    const chunks = file.chunks as ChunkRef[];
    const index = /^\d{1,5}$/.test(params.index) ? Number(params.index) : -1;
    const chunk = chunks.find((c) => c.index === index);
    if (!chunk) throw new ApiError(404, "not_found", "Morceau introuvable.");
    const r = await fetchAndDecryptFile({
      encryptedWebhookUrl: scope.webhook.encryptedUrl,
      encKeyEncrypted: null,
      chunks: [chunk],
      encIv: null,
      locked: false,
      cryptoVersion: 1, // never decrypt server-side: bytes go out exactly as stored
    });
    if (!r.ok) throw new ApiError(502, "upstream_error", r.error);
    return new NextResponse(new Uint8Array(r.body), {
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(r.body.length), "Content-Disposition": "attachment" },
    });
  },
);

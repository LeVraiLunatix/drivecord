import { test } from "node:test";
import assert from "node:assert/strict";
import { contentDisposition, safeContentType, serializeFile, serializeFolder } from "./serialize.ts";

const d = new Date("2026-09-30T10:00:00Z");

test("serializeFile never exposes chunks, CDN urls or IVs", () => {
  const out = serializeFile({
    id: "f1", parentId: "", filename: "a.png", size: 3, mimeType: "image/png", tags: ["x"],
    favorite: false, encIv: "SECRET_IV", trashed: false, trashedAt: null, createdAt: d, updatedAt: d,
    // extra fields a raw Prisma row carries — must not leak
    ...({ chunks: [{ url: "https://cdn.discordapp.com/x" }], webhookId: "w", locked: false } as object),
  });
  const json = JSON.stringify(out);
  assert.ok(!/chunks|cdn\.discordapp|SECRET_IV|webhookId|encIv/.test(json));
  assert.equal(out.encrypted, true);
  assert.equal(out.createdAt, "2026-09-30T10:00:00.000Z");
  assert.equal(out.trashedAt, null);
});

test("serializeFolder", () => {
  const out = serializeFolder({
    id: "d1", parentId: "", name: "N", color: null, trashed: true, trashedAt: d, createdAt: d, updatedAt: d,
  });
  assert.equal(out.trashedAt, "2026-09-30T10:00:00.000Z");
  assert.equal(out.color, null);
});

test("content-disposition survives header injection and unicode", () => {
  const h = contentDisposition('evil"\r\nX-Injected: 1.txt');
  assert.ok(!/[\r\n]/.test(h));
  assert.ok(!h.includes('evil"'));
  const u = contentDisposition("résumé (1).pdf");
  assert.match(u, /filename\*=UTF-8''r%C3%A9sum%C3%A9%20%281%29\.pdf$/);
  assert.match(u, /^attachment; filename="r_sum_ \(1\)\.pdf"/);
});

test("safeContentType falls back to octet-stream", () => {
  assert.equal(safeContentType("image/png"), "image/png");
  assert.equal(safeContentType("text/html"), "text/html"); // served as attachment + nosniff + CSP sandbox
  assert.equal(safeContentType(""), "application/octet-stream");
  assert.equal(safeContentType("x\r\nSet-Cookie: a=b"), "application/octet-stream");
});

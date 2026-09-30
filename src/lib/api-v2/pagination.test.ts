import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "./errors.ts";
import { decodeCursor, encodeCursor, keysetWhere, orderBy, sliceWithCursor } from "./pagination.ts";

test("cursor round-trips for string and date sorts", () => {
  const c1 = encodeCursor("name", "asc", "Rapport.pdf", "id_1");
  assert.deepEqual(decodeCursor(c1, "name", "asc"), { value: "Rapport.pdf", id: "id_1" });

  const at = new Date("2026-09-30T10:00:00Z");
  const c2 = encodeCursor("updatedAt", "desc", at, "id_2");
  const d = decodeCursor(c2, "updatedAt", "desc");
  assert.equal((d.value as Date).getTime(), at.getTime());
  assert.equal(d.id, "id_2");
});

test("cursor is bound to the sort and order it was issued for", () => {
  const c = encodeCursor("name", "asc", "a", "x");
  for (const [s, o] of [["createdAt", "asc"], ["name", "desc"]] as const) {
    assert.throws(() => decodeCursor(c, s, o), (e) => e instanceof ApiError && e.code === "invalid_cursor");
  }
});

test("garbage cursors are rejected", () => {
  const forged = Buffer.from(JSON.stringify({ s: "updatedAt", o: "asc", v: "nope", i: "x" })).toString("base64url");
  for (const bad of ["", "%%%", "not-base64-json", "a".repeat(600), forged]) {
    assert.throws(() => decodeCursor(bad, "updatedAt", "asc"), (e) => e instanceof ApiError);
  }
});

test("keyset where / orderBy follow the sort direction", () => {
  const cur = { value: "m", id: "i" };
  assert.deepEqual(keysetWhere("filename", "asc", cur), {
    OR: [{ filename: { gt: "m" } }, { AND: [{ filename: "m" }, { id: { gt: "i" } }] }],
  });
  assert.deepEqual(keysetWhere("filename", "desc", cur).OR[0], { filename: { lt: "m" } });
  assert.deepEqual(orderBy("filename", "desc"), [{ filename: "desc" }, { id: "desc" }]);
});

test("sliceWithCursor only issues a cursor when a next page exists", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(sliceWithCursor(rows, 3, (r) => r.id), { page: rows, nextCursor: null });
  assert.deepEqual(sliceWithCursor(rows, 2, (r) => r.id), { page: rows.slice(0, 2), nextCursor: "b" });
});

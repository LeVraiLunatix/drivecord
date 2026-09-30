import { test } from "vitest";
import assert from "node:assert/strict";
import { ApiError } from "./errors.ts";
import {
  FOLDER_COLORS,
  assertKnownKeys,
  assertNotEmpty,
  parseColor,
  parseId,
  parseJsonObject,
  parseLimit,
  parseMimePrefix,
  parseName,
  parseParentId,
  parseSearch,
  parseTags,
  parseTimestampParam,
} from "./validate.ts";
import { FOLDER_COLOR_PRESETS } from "../folder-colors.ts";

const rejects = (fn: () => unknown, code?: string) =>
  assert.throws(fn, (e) => e instanceof ApiError && (code === undefined || e.code === code));

test("FOLDER_COLORS stays in sync with the UI presets", () => {
  assert.deepEqual([...FOLDER_COLORS].sort(), Object.keys(FOLDER_COLOR_PRESETS).sort());
});

test("ids: only our alphabet, bounded length", () => {
  assert.equal(parseId("abc_DEF-123"), "abc_DEF-123");
  for (const bad of ["", "a/b", "a b", "../x", "x".repeat(65), "é", 42, null, undefined, "a\n"]) {
    rejects(() => parseId(bad));
  }
  assert.equal(parseParentId(""), "");
  rejects(() => parseParentId(null));
});

test("names: trimmed, NFC, no separators / control / bidi chars", () => {
  assert.equal(parseName("  Factures 2026 "), "Factures 2026");
  assert.equal(parseName("é"), "é");
  for (const bad of ["", "   ", ".", "..", "a/b", "a\\b", "a\u0000b", "a\nb", "evil‮fdp.exe", "x".repeat(256), 5]) {
    rejects(() => parseName(bad));
  }
});

test("tags: deduped, bounded, strings only", () => {
  assert.deepEqual(parseTags([" a ", "a", "b"]), ["a", "b"]);
  rejects(() => parseTags("a"));
  rejects(() => parseTags([1]));
  rejects(() => parseTags([""]));
  rejects(() => parseTags(["x".repeat(33)]));
  rejects(() => parseTags(Array.from({ length: 21 }, (_, i) => `t${i}`)));
});

test("color: preset or null", () => {
  assert.equal(parseColor("blue"), "blue");
  assert.equal(parseColor(null), null);
  rejects(() => parseColor("#ff0000"));
  rejects(() => parseColor(3));
});

test("query params", () => {
  assert.equal(parseLimit(null, 50, 200), 50);
  assert.equal(parseLimit("200", 50, 200), 200);
  for (const bad of ["0", "201", "-1", "1e2", "abc", "10000"]) rejects(() => parseLimit(bad, 50, 200));
  assert.equal(parseSearch(" hello "), "hello");
  rejects(() => parseSearch(""));
  rejects(() => parseSearch("x".repeat(101)));
  assert.equal(parseMimePrefix("IMAGE/"), "image/");
  assert.equal(parseMimePrefix("application/pdf"), "application/pdf");
  rejects(() => parseMimePrefix("image"));
  rejects(() => parseMimePrefix("a/b c"));
  assert.equal(parseTimestampParam("1700000000000", "s")?.getTime(), 1700000000000);
  rejects(() => parseTimestampParam("-1", "s"));
  rejects(() => parseTimestampParam("abc", "s"));
});

test("bodies: must be a JSON object, unknown keys refused", () => {
  assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 });
  for (const bad of ["", "nope", "[]", "null", "3", '"s"']) rejects(() => parseJsonObject(bad), "invalid_json");
  assertKnownKeys({ a: 1 }, ["a", "b"]);
  rejects(() => assertKnownKeys({ a: 1, locked: true }, ["a"]), "unknown_field");
  rejects(() => assertNotEmpty({}));
});

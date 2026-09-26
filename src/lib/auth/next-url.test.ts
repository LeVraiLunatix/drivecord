import { test } from "node:test";
import assert from "node:assert/strict";
import { callbackPath, safeNext } from "./next-url.ts";

const O = "https://drivecord.app";

test("safeNext keeps internal paths only", () => {
  assert.equal(safeNext("/native-handoff"), "/native-handoff");
  assert.equal(safeNext("//evil.example"), "/drive");
  assert.equal(safeNext("/\\evil.example"), "/drive");
  assert.equal(safeNext("https://evil.example"), "/drive");
});

test("callbackPath accepts our own absolute URLs and nothing else", () => {
  assert.equal(callbackPath(null, O), "/drive");
  assert.equal(callbackPath("/backup", O), "/backup");
  assert.equal(callbackPath("https://drivecord.app/shares?x=1#a", O), "/shares?x=1#a");
  assert.equal(callbackPath("https://evil.example/drive", O), "/drive");
  assert.equal(callbackPath("https://drivecord.app.evil.example/", O), "/drive");
  assert.equal(callbackPath("//evil.example", O), "/drive");
  assert.equal(callbackPath("javascript:alert(1)", O), "/drive");
});

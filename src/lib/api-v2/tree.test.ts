import { test } from "node:test";
import assert from "node:assert/strict";
import { depthOf, subtreeHeight, subtreeIds, wouldCreateCycle, type FolderNode } from "./tree.ts";

//  a ─ b ─ c
//  │   └── d
//  e
const nodes: FolderNode[] = [
  { id: "a", parentId: "" },
  { id: "b", parentId: "a" },
  { id: "c", parentId: "b" },
  { id: "d", parentId: "b" },
  { id: "e", parentId: "" },
];

test("subtreeIds includes the root and all descendants", () => {
  assert.deepEqual(subtreeIds(nodes, "a").sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(subtreeIds(nodes, "e"), ["e"]);
});

test("depth and height", () => {
  assert.equal(depthOf(nodes, ""), 0);
  assert.equal(depthOf(nodes, "a"), 1);
  assert.equal(depthOf(nodes, "c"), 3);
  assert.equal(subtreeHeight(nodes, "a"), 3);
  assert.equal(subtreeHeight(nodes, "e"), 1);
});

test("cycle detection", () => {
  assert.equal(wouldCreateCycle(nodes, "a", ""), false);
  assert.equal(wouldCreateCycle(nodes, "a", "e"), false);
  assert.equal(wouldCreateCycle(nodes, "a", "a"), true);
  assert.equal(wouldCreateCycle(nodes, "a", "c"), true);
  assert.equal(wouldCreateCycle(nodes, "c", "a"), false);
});

test("a corrupted loop in the data terminates", () => {
  const loop: FolderNode[] = [{ id: "x", parentId: "y" }, { id: "y", parentId: "x" }];
  assert.ok(depthOf(loop, "x") <= 2);
  assert.deepEqual(subtreeIds(loop, "x").sort(), ["x", "y"]);
  assert.ok(subtreeHeight(loop, "x") <= 2);
});

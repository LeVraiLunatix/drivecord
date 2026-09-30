/**
 * Pure folder-tree helpers. The caller loads `(id, parentId)` for the whole
 * drive once (one query) and these walk it in memory — instead of the
 * level-by-level queries the v1 routes do.
 */
export type FolderNode = { id: string; parentId: string };

export const MAX_FOLDER_DEPTH = 32;

export function buildIndex(nodes: FolderNode[]) {
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    parentOf.set(n.id, n.parentId);
    const siblings = childrenOf.get(n.parentId);
    if (siblings) siblings.push(n.id);
    else childrenOf.set(n.parentId, [n.id]);
  }
  return { parentOf, childrenOf };
}

/** `rootId` and every descendant folder id. */
export function subtreeIds(nodes: FolderNode[], rootId: string): string[] {
  const { childrenOf } = buildIndex(nodes);
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    for (const child of childrenOf.get(cur) ?? []) stack.push(child);
  }
  return out;
}

/** Number of folders from `folderId` up to the root (`""` → 0, a root folder → 1). */
export function depthOf(nodes: FolderNode[], folderId: string): number {
  if (folderId === "") return 0;
  const { parentOf } = buildIndex(nodes);
  let depth = 0;
  let cur = folderId;
  const seen = new Set<string>();
  while (cur !== "" && parentOf.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    depth++;
    cur = parentOf.get(cur)!;
  }
  return depth;
}

/** Height of the subtree rooted at `rootId` (a lone folder → 1). */
export function subtreeHeight(nodes: FolderNode[], rootId: string): number {
  const { childrenOf } = buildIndex(nodes);
  const seen = new Set<string>();
  const walk = (id: string): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    let max = 0;
    for (const c of childrenOf.get(id) ?? []) max = Math.max(max, walk(c));
    return max + 1;
  };
  return walk(rootId);
}

/** Moving `folderId` under `newParentId` would make it its own ancestor. */
export function wouldCreateCycle(nodes: FolderNode[], folderId: string, newParentId: string): boolean {
  if (newParentId === "") return false;
  return subtreeIds(nodes, folderId).includes(newParentId);
}

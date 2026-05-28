"use client";

import * as React from "react";
import { Folder, HardDrive } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ROOT_PARENT,
  listAllFolders,
  moveFile,
  moveFolder,
  type DriveItem,
  type FolderEntry,
  type ParentId,
} from "@/lib/storage";

type Props = {
  /** Single-item mode. Set to null when using `items` bulk mode. */
  item: DriveItem | null;
  /** Bulk mode: overrides `item` when provided and non-empty. */
  items?: DriveItem[];
  driveId: string;
  onOpenChange: (open: boolean) => void;
};

type TreeNode = {
  id: ParentId;
  name: string;
  depth: number;
  disabled?: boolean;
};

/**
 * Folder picker for the "Move to..." action.
 *
 * Builds a flat list of tree nodes (depth-indented) from the folder rows.
 * Disables:
 *  - the folder we're trying to move (you can't move A → A)
 *  - any descendant of that folder (you can't move A → A/B/C)
 *  - the folder where the item currently lives (no-op)
 */
export function MoveDialog({ item, items: bulkItems, driveId, onOpenChange }: Props) {
  // Effective items: bulk mode takes precedence.
  const effectiveItems = bulkItems && bulkItems.length > 0 ? bulkItems : item ? [item] : [];
  const open = effectiveItems.length > 0;
  const isBulk = bulkItems !== undefined && bulkItems.length > 0;

  const [folders, setFolders] = React.useState<FolderEntry[]>([]);
  const [target, setTarget] = React.useState<ParentId>(ROOT_PARENT);
  const [busy, setBusy] = React.useState(false);

  // Load all folders for this drive when the dialog opens.
  React.useEffect(() => {
    if (!open || !driveId) return;
    let cancelled = false;
    listAllFolders(driveId).then((rows) => {
      if (!cancelled) setFolders(rows);
    });
    setTarget(ROOT_PARENT);
    return () => {
      cancelled = true;
    };
  }, [open, driveId, effectiveItems.map((i) => i.id).join(",")]);

  const tree = React.useMemo(() => {
    if (effectiveItems.length === 0) return [];
    // Forbidden: self-folders + their descendants (prevents cycles).
    // In single-item mode also forbid the current parent (no-op move).
    const forbidden = new Set<string>();
    const idChildMap = new Map<string, string[]>();
    for (const f of folders) {
      const arr = idChildMap.get(f.parentId) ?? [];
      arr.push(f.id);
      idChildMap.set(f.parentId, arr);
    }
    for (const it of effectiveItems) {
      if (!isBulk) forbidden.add(it.parentId); // disable no-op target in single mode
      if (it.kind === "folder") {
        const queue = [it.id];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          forbidden.add(cur);
          for (const c of idChildMap.get(cur) ?? []) queue.push(c);
        }
      }
    }

    // Build the flat indented list via DFS from ROOT_PARENT.
    const out: TreeNode[] = [];
    out.push({
      id: ROOT_PARENT,
      name: "Mon drive",
      depth: 0,
      disabled: forbidden.has(ROOT_PARENT),
    });
    const childMap = new Map<string, FolderEntry[]>();
    for (const f of folders) {
      const arr = childMap.get(f.parentId) ?? [];
      arr.push(f);
      childMap.set(f.parentId, arr);
    }
    for (const arr of childMap.values()) {
      arr.sort((a, b) =>
        a.name.localeCompare(b.name, "fr", { numeric: true }),
      );
    }
    const walk = (parent: ParentId, depth: number) => {
      for (const f of childMap.get(parent) ?? []) {
        out.push({
          id: f.id,
          name: f.name,
          depth,
          disabled: forbidden.has(f.id),
        });
        walk(f.id, depth + 1);
      }
    };
    walk(ROOT_PARENT, 1);
    return out;
  }, [folders, effectiveItems, isBulk]);

  const submit = async () => {
    if (effectiveItems.length === 0) return;
    setBusy(true);
    try {
      for (const it of effectiveItems) {
        if (it.kind === "folder") await moveFolder(it.id, target);
        else await moveFile(it.id, target);
      }
      toast.success(
        effectiveItems.length > 1
          ? `${effectiveItems.length} éléments déplacés`
          : "Déplacé",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(`Déplacement impossible : ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const hasFolder = effectiveItems.some((i) => i.kind === "folder");
  // In single mode, the submit button is disabled when target === current parent.
  const isNoOp = !isBulk && effectiveItems[0]?.parentId === target;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Déplacer ${effectiveItems.length} éléments…` : "Déplacer…"}
          </DialogTitle>
          <DialogDescription>
            Choisis un dossier de destination.{" "}
            {hasFolder && (
              <span>Les dossiers seront déplacés avec tout leur contenu.</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 overflow-y-auto rounded-md border border-border/50 bg-background/40 p-1">
          {tree.map((n) => {
            const selected = n.id === target;
            return (
              <li key={n.id || "__root"}>
                <button
                  type="button"
                  disabled={n.disabled}
                  onClick={() => setTarget(n.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                    selected
                      ? "bg-primary/15 text-foreground"
                      : "hover:bg-accent/60",
                    n.disabled && "cursor-not-allowed opacity-40",
                  )}
                  style={{ paddingLeft: `${0.5 + n.depth * 1.25}rem` }}
                >
                  {n.id === ROOT_PARENT ? (
                    <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Folder className="size-4 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate">{n.name}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={busy || isNoOp}
          >
            Déplacer ici
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Folder,
} from "lucide-react";
import { DriveItemCard } from "./item-card";
import { DriveItemRow } from "./item-row";
import { EmptyState } from "./empty-state";
import { SelectionToolbar } from "./selection-toolbar";
import { cn } from "@/lib/utils";
import { kindOf } from "@/lib/utils/file-icons";
import type { ItemAction } from "./item-menu";
import type { DriveItem } from "@/lib/storage";
import type { FilterKind, SortDir, SortField, ViewMode } from "@/lib/view-prefs";

// ── Sort helpers ──────────────────────────────────────────────────────────────

function itemName(item: DriveItem): string {
  return item.kind === "folder" ? item.name : item.filename;
}

function itemMtime(item: DriveItem): number {
  return item.updatedAt ?? item.createdAt;
}

function sortItems(
  items: DriveItem[],
  field: SortField,
  dir: SortDir,
): DriveItem[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    let cmp = 0;
    switch (field) {
      case "name":
        cmp = itemName(a).localeCompare(itemName(b), "fr", { numeric: true });
        break;
      case "date":
        cmp = itemMtime(a) - itemMtime(b);
        break;
      case "size":
        if (a.kind === "folder" && b.kind === "folder") {
          cmp = a.name.localeCompare(b.name, "fr", { numeric: true });
        } else {
          const sA = a.kind === "file" ? a.size : 0;
          const sB = b.kind === "file" ? b.size : 0;
          cmp = sA - sB;
        }
        break;
      case "type": {
        const kA = a.kind === "folder" ? "" : kindOf(a.filename, a.mimeType);
        const kB = b.kind === "folder" ? "" : kindOf(b.filename, b.mimeType);
        cmp = kA.localeCompare(kB) || itemName(a).localeCompare(itemName(b), "fr");
        break;
      }
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function filterItems(items: DriveItem[], filterKind: FilterKind): DriveItem[] {
  if (filterKind === "all") return items;
  return items.filter((item) => {
    if (item.kind === "folder") return true;
    return kindOf(item.filename, item.mimeType) === filterKind;
  });
}

// ── List header ───────────────────────────────────────────────────────────────

function ListHeader({
  sortField,
  sortDir,
  onSortChange,
  hasCheckbox,
}: {
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  hasCheckbox: boolean;
}) {
  const toggle = (field: SortField) =>
    onSortChange(
      field,
      sortField === field ? (sortDir === "asc" ? "desc" : "asc") : "asc",
    );
  const SortIcon = sortDir === "asc" ? ChevronUp : ChevronDown;
  const col = (field: SortField) =>
    cn(
      "flex items-center gap-0.5 transition-colors hover:text-foreground",
      sortField === field && "text-foreground",
    );
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground select-none">
      {hasCheckbox && <div className="size-5 shrink-0" />}
      <div className="size-8 shrink-0" />
      <button onClick={() => toggle("name")} className={cn(col("name"), "flex-1")}>
        Nom {sortField === "name" && <SortIcon className="size-3" />}
      </button>
      <button onClick={() => toggle("type")} className={cn(col("type"), "hidden w-24 shrink-0 md:flex")}>
        Type {sortField === "type" && <SortIcon className="size-3" />}
      </button>
      <button onClick={() => toggle("size")} className={cn(col("size"), "hidden w-20 shrink-0 justify-end sm:flex")}>
        Taille {sortField === "size" && <SortIcon className="size-3" />}
      </button>
      <button onClick={() => toggle("date")} className={cn(col("date"), "hidden w-28 shrink-0 justify-end lg:flex")}>
        Modifié {sortField === "date" && <SortIcon className="size-3" />}
      </button>
      <div className="size-7 shrink-0" />
    </div>
  );
}

// ── Explorer ──────────────────────────────────────────────────────────────────

export type BulkAction = "download" | "delete" | "move" | "tag";

type Props = {
  items: DriveItem[] | undefined;
  viewMode: ViewMode;
  sortField: SortField;
  sortDir: SortDir;
  filterKind: FilterKind;
  onSortChange: (field: SortField, dir: SortDir) => void;
  onAction: (action: ItemAction, item: DriveItem) => void;
  onOpenFolder: (folderId: string) => void;
  onPreviewFile: (fileId: string) => void;
  onDropItem?: (sourceItemId: string, target: DriveItem) => void;
  onDropExternalFiles?: (files: File[], target: DriveItem) => void;
  onBulkAction?: (action: BulkAction, items: DriveItem[]) => void;
  empty?: { title: string; description: string };
};

export function DriveExplorer({
  items,
  viewMode,
  sortField,
  sortDir,
  filterKind,
  onSortChange,
  onAction,
  onOpenFolder,
  onPreviewFile,
  onDropItem,
  onDropExternalFiles,
  onBulkAction,
  empty,
}: Props) {
  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = React.useState<string | null>(null);

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  // ── Rubber-band (lasso) selection ────────────────────────────────────────────
  const [selBox, setSelBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragOriginRef = React.useRef<{ x: number; y: number } | null>(null);
  const explorerRef = React.useRef<HTMLDivElement>(null);

  // Attach at window level so empty space below/around items is covered,
  // but restrict to clicks inside the explorer container.
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Must be within the explorer's visible bounding box
      if (!explorerRef.current) return;
      const rect = explorerRef.current.getBoundingClientRect();
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom
      ) return;
      const target = e.target as HTMLElement;
      // Skip interactive elements and items
      if (target.closest('[role="dialog"]')) return;
      if (target.closest("button, input, textarea, select, a")) return;
      if (target.closest("[data-item-id]")) return;

      const sx = e.clientX;
      const sy = e.clientY;
      dragOriginRef.current = { x: sx, y: sy };
      // Clear selection on bare mousedown (stable setters, no deps needed)
      setSelectedIds(new Set());
      setLastSelectedId(null);

      const onMove = (me: MouseEvent) => {
        if (!dragOriginRef.current) return;
        // Safety net: mouse released outside browser window → mouseup never fired
        if (me.buttons === 0) { onUp(); return; }
        const { x: ox, y: oy } = dragOriginRef.current;
        const x = Math.min(ox, me.clientX);
        const y = Math.min(oy, me.clientY);
        const w = Math.abs(me.clientX - ox);
        const h = Math.abs(me.clientY - oy);
        if (w > 4 || h > 4) {
          setSelBox({ x, y, w, h });
          const next = new Set<string>();
          document.querySelectorAll<HTMLElement>("[data-item-id]").forEach((el) => {
            const r = el.getBoundingClientRect();
            if (x < r.right && x + w > r.left && y < r.bottom && y + h > r.top) {
              const id = el.dataset.itemId;
              if (id) next.add(id);
            }
          });
          setSelectedIds(next);
        }
      };

      const onUp = () => {
        dragOriginRef.current = null;
        setSelBox(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // state setters are stable — no deps needed

  // Filter + sort (computed early so keyboard shortcuts can reference it)
  const processed = React.useMemo(() => {
    if (!items) return [];
    return sortItems(filterItems(items, filterKind), sortField, sortDir);
  }, [items, filterKind, sortField, sortDir]);

  // Global keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "Escape") { clearSelection(); return; }

      if (inInput) return;

      // Ctrl/Cmd+A — select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && processed.length > 0) {
        e.preventDefault();
        setSelectedIds(new Set(processed.map((i) => i.id)));
        return;
      }

      // Delete / Backspace — move to trash
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        onBulkAction?.("delete", processed.filter((i) => selectedIds.has(i.id)));
        return;
      }

      // F2 — rename (single selection only)
      if (e.key === "F2" && selectedIds.size === 1) {
        e.preventDefault();
        const item = processed.find((i) => selectedIds.has(i.id));
        if (item) onAction("rename", item);
        return;
      }

      // Enter — open / preview (single selection only)
      if (e.key === "Enter" && selectedIds.size === 1) {
        e.preventDefault();
        const item = processed.find((i) => selectedIds.has(i.id));
        if (!item) return;
        clearSelection();
        if (item.kind === "folder") onOpenFolder(item.id);
        else onPreviewFile(item.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSelection, selectedIds, processed, onBulkAction, onAction, onOpenFolder, onPreviewFile]);

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (items === undefined) {
    return viewMode === "grid" ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border/40 bg-card/30" />
        ))}
      </div>
    ) : (
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card/20">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse border-b border-border/30 bg-card/30 last:border-b-0" />
        ))}
      </div>
    );
  }

  // Empty folder
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Folder}
        title={empty?.title ?? "Aucun fichier ici"}
        description={empty?.description ?? "Glisse-dépose des fichiers n'importe où, ou clique sur « Upload » pour commencer."}
      />
    );
  }

  if (processed.length === 0) {
    return (
      <EmptyState
        icon={Filter}
        title="Aucun résultat"
        description="Aucun élément ne correspond au filtre actif. Essaie « Tous » pour tout afficher."
      />
    );
  }

  // ── Click handler factory ────────────────────────────────────────────────────
  const makeClickHandler = (item: DriveItem, index: number) => (e: React.MouseEvent) => {
    const id = item.id;

    if (e.shiftKey && lastSelectedId !== null) {
      const lastIdx = processed.findIndex((i) => i.id === lastSelectedId);
      if (lastIdx !== -1) {
        const [from, to] = [Math.min(lastIdx, index), Math.max(lastIdx, index)];
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) next.add(processed[i].id);
          return next;
        });
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastSelectedId(id);
      return;
    }

    // Plain click: select this item only (or deselect if already sole selection)
    if (selectedIds.size === 1 && selectedIds.has(id)) {
      clearSelection();
    } else {
      setSelectedIds(new Set([id]));
      setLastSelectedId(id);
    }
  };

  // ── Bulk action helpers ──────────────────────────────────────────────────────
  const selectedItems = processed.filter((i) => selectedIds.has(i.id));

  const itemProps = (item: DriveItem, index: number) => ({
    item,
    selected: selectedIds.has(item.id),
    onItemClick: onBulkAction ? makeClickHandler(item, index) : undefined,
    onAction,
    onDoubleClick: (i: DriveItem) => {
      clearSelection();
      if (i.kind === "folder") onOpenFolder(i.id);
      else onPreviewFile(i.id);
    },
    onDropItem,
    onDropExternalFiles,
  });

  // ── Rubber-band rectangle (fixed overlay) ────────────────────────────────────
  const rubberBand = selBox && selBox.w > 4 && selBox.h > 4 && (
    <div
      className="pointer-events-none fixed z-[99] rounded border border-primary/50 bg-primary/10"
      style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }}
    />
  );

  // ── Shared toolbar ────────────────────────────────────────────────────────────
  const toolbar = onBulkAction && (
    <SelectionToolbar
      count={selectedIds.size}
      onDownload={() => onBulkAction("download", selectedItems)}
      onDelete={() => onBulkAction("delete", selectedItems)}
      onMove={() => onBulkAction("move", selectedItems)}
      onTag={() => onBulkAction("tag", selectedItems)}
      onClear={clearSelection}
    />
  );

  // ── Grid view ────────────────────────────────────────────────────────────────
  if (viewMode === "grid") {
    return (
      <div ref={explorerRef} className="min-h-full">
        {rubberBand}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {processed.map((item, index) => (
            <DriveItemCard key={`${item.kind}-${item.id}`} {...itemProps(item, index)} />
          ))}
        </div>
        {toolbar}
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div ref={explorerRef} className="min-h-full">
      {rubberBand}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card/20">
        <ListHeader
          sortField={sortField}
          sortDir={sortDir}
          onSortChange={onSortChange}
          hasCheckbox={!!onBulkAction}
        />
        {processed.map((item, index) => (
          <DriveItemRow key={`${item.kind}-${item.id}`} {...itemProps(item, index)} />
        ))}
      </div>
      {toolbar}
    </div>
  );
}

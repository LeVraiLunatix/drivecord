"use client";

import * as React from "react";
import { Check, Folder, MoreVertical, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatBytes, formatRelativeTime } from "@/lib/utils/format";
import { iconFor, kindOf } from "@/lib/utils/file-icons";
import { folderIconClass } from "@/lib/folder-colors";
import { useFolderItemCount, type DriveItem } from "@/lib/storage";
import { TagBadge } from "./tag-badge";
import {
  isExternalFileDrag,
  isInternalItemDrag,
  readItemDrag,
  setItemDrag,
} from "@/lib/drive-dnd";
import { buildItemMenu, type ItemAction } from "./item-menu";
import { useLongPress } from "./use-long-press";

export type { ItemAction };

const KIND_LABELS: Record<string, string> = {
  folder: "Dossier",
  image: "Image",
  video: "Vidéo",
  audio: "Audio",
  pdf: "PDF",
  doc: "Document",
  spreadsheet: "Tableur",
  archive: "Archive",
  code: "Code",
  text: "Texte",
  other: "Fichier",
};

type Props = {
  item: DriveItem;
  selected?: boolean;
  onAction: (action: ItemAction, item: DriveItem) => void;
  onDoubleClick?: (item: DriveItem) => void;
  onItemClick?: (e: React.MouseEvent) => void;
  onDropItem?: (sourceItemId: string, target: DriveItem) => void;
  onDropExternalFiles?: (files: File[], target: DriveItem) => void;
};

export const DriveItemRow = React.memo(function DriveItemRow({
  item,
  selected,
  onAction,
  onDoubleClick,
  onItemClick,
  onDropItem,
  onDropExternalFiles,
}: Props) {
  const isFolder = item.kind === "folder";
  const name = isFolder ? item.name : item.filename;
  const size = isFolder ? null : item.size;
  const mtime = item.updatedAt ?? item.createdAt;
  const { Icon, colorClass } = isFolder
    ? { Icon: Folder, colorClass: folderIconClass(item.color) }
    : iconFor(item.filename, item.mimeType);
  const tags = !isFolder ? item.tags : [];
  const favorite = !isFolder && item.favorite;
  const menu = React.useMemo(() => buildItemMenu(item), [item]);
  const childCount = useFolderItemCount(
    isFolder ? item.driveId : null,
    isFolder ? item.id : "",
  );

  const fileKind = isFolder ? "folder" : kindOf(item.filename, item.mimeType);
  const kindLabel = KIND_LABELS[fileKind] ?? "Fichier";

  // --- Long press → select ---
  const longPress = useLongPress(() => onItemClick?.({ shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent));

  // --- Drag source ---
  const handleDragStart = (e: React.DragEvent) => {
    setItemDrag(e.dataTransfer, item);
  };

  // --- Drop target (folders only) ---
  const [dragOver, setDragOver] = React.useState(false);

  const couldAcceptDrop = (e: React.DragEvent): boolean => {
    if (!isFolder) return false;
    return (
      isExternalFileDrag(e.dataTransfer) || isInternalItemDrag(e.dataTransfer)
    );
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!couldAcceptDrop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = isExternalFileDrag(e.dataTransfer)
      ? "copy"
      : "move";
    if (!dragOver) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!isFolder) return;
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!couldAcceptDrop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (isExternalFileDrag(e.dataTransfer)) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length && onDropExternalFiles) onDropExternalFiles(files, item);
      return;
    }
    if (isInternalItemDrag(e.dataTransfer)) {
      const payload = readItemDrag(e.dataTransfer);
      if (!payload) return;
      if (payload.id === item.id) return; // self-drop
      if (payload.parentId === item.id) return; // no-op
      if (onDropItem) onDropItem(payload.id, item);
    }
  };

  /**
   * Architecture note: same as item-card — draggable wrapper sits OUTSIDE
   * ContextMenuTrigger to avoid Radix Slot swallowing drag events.
   */
  return (
    <div
      draggable
      data-item-id={item.id}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "group border-b border-border/30 transition-colors last:border-b-0",
        selected && "bg-primary/5",
        dragOver && "bg-primary/10 ring-1 ring-inset ring-primary/40",
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if (e.detail > 1) return;
              if (longPress.didFire()) return;
              e.stopPropagation();
              onItemClick?.(e);
            }}
            onDoubleClick={() => onDoubleClick?.(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onDoubleClick?.(item);
            }}
            className="flex items-center gap-3 px-3 py-2.5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring hover:bg-accent/40"
            {...longPress.handlers}
          >
            {/* Selection checkbox */}
            {onItemClick && (
              <div
                onClick={(e) => { e.stopPropagation(); onItemClick(e); }}
                className={cn(
                  "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-all",
                  selected
                    ? "border-primary bg-primary text-primary-foreground opacity-100"
                    : "border-muted-foreground/50 bg-background/80 opacity-0 group-hover:opacity-100",
                )}
              >
                {selected && <Check className="size-3" />}
              </div>
            )}

            {/* File / folder icon */}
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md",
                colorClass,
              )}
            >
              <Icon className="size-4" />
            </div>

            {/* Name + tags + favorite star */}
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className="truncate text-sm font-medium leading-tight"
                title={name}
              >
                {name}
              </span>
              {tags.length > 0 && (
                <>
                  <TagBadge tag={tags[0]} />
                  {tags.length > 1 && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      +{tags.length - 1}
                    </span>
                  )}
                </>
              )}
              {favorite && (
                <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
              )}
            </div>

            {/* Kind label */}
            <span className="hidden w-24 shrink-0 text-xs text-muted-foreground md:block">
              {kindLabel}
            </span>

            {/* Size / child count */}
            <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:block">
              {isFolder
                ? childCount === undefined
                  ? "—"
                  : `${childCount} élém.`
                : formatBytes(size ?? 0)}
            </span>

            {/* Modified date */}
            <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground lg:block">
              {formatRelativeTime(mtime)}
            </span>

            {/* Inline action button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menu.map((m, i) =>
                  m.kind === "separator" ? (
                    <DropdownMenuSeparator key={`s-${i}`} />
                  ) : (
                    <DropdownMenuItem
                      key={m.action}
                      onSelect={() => onAction(m.action, item)}
                      className={
                        m.destructive
                          ? "text-destructive focus:text-destructive"
                          : undefined
                      }
                    >
                      {m.label}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          {menu.map((m, i) =>
            m.kind === "separator" ? (
              <ContextMenuSeparator key={`cs-${i}`} />
            ) : (
              <ContextMenuItem
                key={m.action}
                onSelect={() => onAction(m.action, item)}
                className={
                  m.destructive
                    ? "text-destructive focus:text-destructive"
                    : undefined
                }
              >
                {m.label}
              </ContextMenuItem>
            ),
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
});

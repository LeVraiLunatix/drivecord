"use client";

import * as React from "react";
import { Check, Folder, Star } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { formatBytes, formatRelativeTime } from "@/lib/utils/format";
import { iconFor, kindOf } from "@/lib/utils/file-icons";
import { folderIconClass } from "@/lib/folder-colors";
import {
  useFolderItemCount,
  type DriveItem,
} from "@/lib/storage";
import {
  isExternalFileDrag,
  isInternalItemDrag,
  readItemDrag,
  setItemDrag,
} from "@/lib/drive-dnd";
import { useDiscordClient } from "@/lib/discord/context";
import { getThumbnail, generateThumbnail } from "@/lib/thumbnail-cache";
import { buildItemMenu, type ItemAction } from "./item-menu";
import { ItemMenuButton } from "./item-menu-button";
import { TagBadge } from "./tag-badge";
import { useLongPress } from "./use-long-press";

export type { ItemAction };

type Props = {
  item: DriveItem;
  selected?: boolean;
  onAction: (action: ItemAction, item: DriveItem) => void;
  onDoubleClick?: (item: DriveItem) => void;
  /** Called on single-click — used by the explorer for selection logic. */
  onItemClick?: (e: React.MouseEvent) => void;
  onDropItem?: (sourceItemId: string, target: DriveItem) => void;
  onDropExternalFiles?: (files: File[], target: DriveItem) => void;
};

export const DriveItemCard = React.memo(function DriveItemCard({
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

  // --- Thumbnail (images only) ---
  const client = useDiscordClient();
  const isImage = !isFolder && kindOf(item.filename, item.mimeType) === "image";
  const [thumbnailUrl, setThumbnailUrl] = React.useState<string | null>(() =>
    isImage ? getThumbnail(item.id) : null,
  );
  React.useEffect(() => {
    if (!isImage || item.kind !== "file" || !client) return;
    if (getThumbnail(item.id)) return; // already cached
    let cancelled = false;
    generateThumbnail(item.id, {
      size: item.size,
      mimeType: item.mimeType,
      filename: item.filename,
      chunkSize: item.chunkSize,
      chunks: item.chunks,
    }, client).then((url) => {
      if (!cancelled && url) setThumbnailUrl(url);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, isImage]);

  // --- Long press → select ---
  const longPress = useLongPress(() => onItemClick?.({ shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent));

  // --- Drag source ---
  const handleDragStart = (e: React.DragEvent) => {
    setItemDrag(e.dataTransfer, item);
  };

  // --- Drop target (folders only) ---
  const [dragOver, setDragOver] = React.useState(false);
  /**
   * IMPORTANT: HTML5 spec puts DataTransfer in "protected mode" during
   * dragenter/dragover — we can read `types` but NOT call `getData()`.
   * So we accept the drop based on MIME presence only; deeper validation
   * (no self-drop, no no-op, no cycle) happens at drop time.
   */
  const couldAcceptDrop = (e: React.DragEvent): boolean => {
    if (!isFolder) return false;
    return (
      isExternalFileDrag(e.dataTransfer) ||
      isInternalItemDrag(e.dataTransfer)
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
    if (
      e.currentTarget === e.target ||
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
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
      // Deeper validation now that we can actually read the payload.
      if (payload.id === item.id) return; // self-drop
      if (payload.parentId === item.id) return; // no-op
      if (onDropItem) onDropItem(payload.id, item);
    }
  };

  /**
   * Architecture note: the draggable wrapper sits OUTSIDE the Radix
   * ContextMenuTrigger. With `asChild`, Radix's Slot wraps the trigger child
   * in event listeners (notably onPointerDown for long-press detection) that
   * can swallow drag initiation in some browser/OS combos. Keeping draggable
   * on a parent div avoids that whole class of issues.
   *
   * The visual container is still one box — the wrapper just adds drag wiring
   * with no additional DOM padding.
   */
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-item-id={item.id}
      className={cn(
        "group relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border/50 bg-card/40 p-3 transition-all hover:border-border hover:bg-card/70",
        selected && "border-primary/60 bg-primary/5",
        dragOver &&
          "border-primary scale-[1.02] bg-primary/10 shadow-md ring-2 ring-primary/30",
      )}
    >
      {/* Selection checkbox — visible on hover or when selected */}
      {onItemClick && (
        <div
          onClick={(e) => { e.stopPropagation(); onItemClick(e); }}
          className={cn(
            "absolute left-1.5 top-1.5 z-10 flex size-5 cursor-pointer items-center justify-center rounded-md border-2 transition-all",
            selected
              ? "border-primary bg-primary text-primary-foreground opacity-100"
              : "border-muted-foreground/50 bg-background/80 opacity-0 group-hover:opacity-100",
          )}
        >
          {selected && <Check className="size-3" />}
        </div>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if (e.detail > 1) return; // let dblclick handle open
              if (longPress.didFire()) return; // long press already handled
              e.stopPropagation();
              onItemClick?.(e);
            }}
            onDoubleClick={() => onDoubleClick?.(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onDoubleClick?.(item);
            }}
            className="flex flex-1 flex-col gap-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
            {...longPress.handlers}
          >
            {/* ── Thumbnail (images) or icon (everything else) ── */}
            {thumbnailUrl ? (
              <div className="relative -mx-3 -mt-3 h-28 bg-muted/20">
                <img
                  src={thumbnailUrl}
                  alt={name}
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                {favorite && (
                  <Star className="absolute bottom-1.5 left-1.5 size-3.5 fill-amber-400 text-amber-400 drop-shadow" />
                )}
                <div className="absolute right-1 top-1">
                  <ItemMenuButton
                    item={item}
                    menu={menu}
                    name={name}
                    onAction={onAction}
                    className="bg-black/30 text-white hover:bg-black/50"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg",
                    colorClass,
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="flex items-center gap-0.5">
                  {favorite && (
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  )}
                  <ItemMenuButton item={item} menu={menu} name={name} onAction={onAction} />
                </div>
              </div>
            )}

            <div className="space-y-1 pt-1">
              <p
                className="truncate text-sm font-medium leading-tight"
                title={name}
              >
                {name}
              </p>
              <p className="text-xs text-muted-foreground">
                {isFolder
                  ? childCount === undefined
                    ? "Dossier"
                    : `${childCount} élément${childCount > 1 ? "s" : ""}`
                  : formatBytes(size ?? 0)}
                {" · "}
                {formatRelativeTime(mtime)}
              </p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {tags.slice(0, 2).map((t) => (
                    <TagBadge key={t} tag={t} />
                  ))}
                  {tags.length > 2 && (
                    <span className="text-[10px] text-muted-foreground self-center">
                      +{tags.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
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

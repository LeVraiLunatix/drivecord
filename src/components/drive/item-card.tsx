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
import { decryptDownloaded } from "@/lib/e2ee-client/file-crypto";
import { TagBadge } from "./tag-badge";
import { useLongPress, useTouchOnly, type ItemClickIntent } from "./use-long-press";

export type { ItemAction };

type Props = {
  item: DriveItem;
  selected?: boolean;
  onAction: (action: ItemAction, item: DriveItem) => void;
  onDoubleClick?: (item: DriveItem) => void;
  /** Called on single-click — used by the explorer for selection logic. */
  /** `intent`: "toggle" from the checkbox, "hold" from a long press. */
  onItemClick?: (e: React.MouseEvent, intent?: ItemClickIntent) => void;
  onDropItem?: (sourceItemId: string, target: DriveItem) => void;
  onDropExternalFiles?: (files: File[], target: DriveItem) => void;
  /** Sans case de sélection (ex. les Récents de l'accueil, où un clic ouvre simplement). */
  plain?: boolean;
};

export const DriveItemCard = React.memo(function DriveItemCard({
  item,
  selected,
  onAction,
  onDoubleClick,
  onItemClick,
  onDropItem,
  onDropExternalFiles,
  plain,
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
    }, client, 240, (raw) => decryptDownloaded(item.driveId, raw, item)).then((url) => {
      if (!cancelled && url) setThumbnailUrl(url);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, isImage, client]);

  // --- Long press → select ---
  const longPress = useLongPress(() => onItemClick?.({ shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent, "hold"));
  const touchOnly = useTouchOnly();

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
        "group relative flex flex-col transition-transform duration-200 active:scale-[0.98]",
        // Dossier : une tuile de verre KitCord. Fichier : la vignette seule, le nom en dessous.
        isFolder && "cord-glass rounded-[var(--cord-radius-card)] hover:-translate-y-0.5",
        isFolder && selected && "outline outline-2 outline-offset-4 outline-[var(--cord-light-mid)]",
        dragOver && "scale-[1.02] outline outline-2 outline-offset-4 outline-primary",
      )}
    >
      {/* Case de sélection — visible au survol ou quand elle est cochée */}
      {onItemClick && !plain && (
        <div
          onClick={(e) => { e.stopPropagation(); onItemClick(e, "toggle"); }}
          className={cn(
            "absolute z-10 flex size-7 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-all",
            isFolder ? "right-16 top-1/2 -translate-y-1/2" : "left-4 top-4",
            selected
              ? "border-[var(--cord-light-core)] bg-[var(--cord-light-core)] text-[var(--cord-ink)] opacity-100"
              : "border-white/70 bg-black/35 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          {selected && <Check className="size-3.5" strokeWidth={2.6} />}
        </div>
      )}
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild disabled={touchOnly}>
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
            className="flex flex-1 flex-col gap-4 outline-none focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]"
            {...longPress.handlers}
          >
            {isFolder ? (
              /* ── Dossier : tuile de verre, horizontale ── */
              <div className="flex h-20 items-center gap-4 px-6">
                <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", colorClass)}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15.5px] font-semibold leading-tight" title={name}>{name}</p>
                  <p className="mt-1 truncate text-[13.5px] text-[var(--cord-dim)]" title={`Modifié ${formatRelativeTime(mtime)}`}>
                    {childCount === undefined ? "Dossier" : `${childCount} élément${childCount > 1 ? "s" : ""}`}
                  </p>
                </div>
                <ItemMenuButton item={item} menu={menu} name={name} onAction={onAction} />
              </div>
            ) : (
              /* ── Fichier : grande vignette, le nom en dessous ── */
              <>
                <div
                  className={cn(
                    "relative flex h-44 items-center justify-center overflow-hidden rounded-[var(--cord-radius-card)] bg-[var(--cord-ink-2)] ring-1 ring-inset ring-[var(--cord-line)] sm:h-48",
                    selected && "outline outline-2 outline-offset-4 outline-[var(--cord-light-mid)]",
                  )}
                >
                  {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={name} draggable={false} className="h-full w-full object-cover " />
                  ) : (
                    <div className={cn("flex size-14 items-center justify-center rounded-2xl", colorClass)}>
                      <Icon className="size-7" />
                    </div>
                  )}
                  {favorite && <Star className="absolute bottom-3 right-3 size-4 fill-amber-400 text-amber-400 drop-shadow" />}
                  <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                    <ItemMenuButton item={item} menu={menu} name={name} onAction={onAction} className="bg-black/55 backdrop-blur hover:bg-black/70" />
                  </div>
                </div>
                <div className="space-y-1 px-1">
                  <p className="truncate text-base font-medium leading-tight" title={name}>{name}</p>
                  <p className="text-sm text-[var(--cord-dim)]">
                    {formatBytes(size ?? 0)}
                    {" · "}
                    {formatRelativeTime(mtime)}
                  </p>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {tags.slice(0, 2).map((t) => <TagBadge key={t} tag={t} />)}
                      {tags.length > 2 && <span className="self-center text-[10px] text-muted-foreground">+{tags.length - 2}</span>}
                    </div>
                  )}
                </div>
              </>
            )}
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

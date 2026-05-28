/**
 * Drag & drop conventions shared between the explorer cards, the breadcrumbs,
 * and the page-level upload dropzone.
 *
 * Internal drags (an item being reorganized inside the drive) use a custom
 * MIME type so we can distinguish them from external file drops:
 *
 *   application/x-drivecord-item   →  payload is a JSON DragPayload
 *
 * External file drops are detected via DataTransfer.types containing "Files".
 */

import type { DriveItem } from "./storage";

export const DRIVECORD_ITEM_MIME = "application/x-drivecord-item";

export type DragPayload = {
  kind: "file" | "folder";
  id: string;
  /** Useful to refuse drops into the source's own subtree. */
  parentId: string;
};

export function setItemDrag(dt: DataTransfer, item: DriveItem): void {
  const payload: DragPayload = {
    kind: item.kind,
    id: item.id,
    parentId: item.parentId,
  };
  dt.setData(DRIVECORD_ITEM_MIME, JSON.stringify(payload));
  // text/plain fallback so dragging into other surfaces doesn't look broken
  dt.setData("text/plain", item.kind === "folder" ? item.name : item.filename);
  dt.effectAllowed = "move";
}

export function readItemDrag(dt: DataTransfer): DragPayload | null {
  const raw = dt.getData(DRIVECORD_ITEM_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

/** True if the drag is carrying actual file objects from the OS. */
export function isExternalFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types).includes("Files");
}

/** True if the drag is one of our own items. */
export function isInternalItemDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types).includes(DRIVECORD_ITEM_MIME);
}

"use client";

import * as React from "react";
import { ChevronRight, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROOT_PARENT, useFolderPath, type ParentId } from "@/lib/storage";
import {
  isInternalItemDrag,
  readItemDrag,
} from "@/lib/drive-dnd";

type Props = {
  driveId: string | null;
  currentFolderId: ParentId;
  onNavigate: (folderId: ParentId) => void;
  /** Move an item into the breadcrumb folder via drag&drop. */
  onDropItem?: (sourceItemId: string, targetFolderId: ParentId) => void;
};

export function DriveBreadcrumbs({
  driveId,
  currentFolderId,
  onNavigate,
  onDropItem,
}: Props) {
  const path = useFolderPath(driveId, currentFolderId);

  return (
    <nav
      aria-label="Fil d'Ariane"
      className="flex items-center gap-1 text-sm"
    >
      <BreadcrumbButton
        targetId={ROOT_PARENT}
        onClick={() => onNavigate(ROOT_PARENT)}
        onDropItem={onDropItem}
        active={currentFolderId === ROOT_PARENT}
      >
        <HardDrive className="size-3.5" />
        Mon drive
      </BreadcrumbButton>
      {(path ?? []).map((f, i) => (
        <div key={f.id} className="flex items-center gap-1">
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <BreadcrumbButton
            targetId={f.id}
            onClick={() => onNavigate(f.id)}
            onDropItem={onDropItem}
            active={i === (path?.length ?? 0) - 1}
          >
            {f.name}
          </BreadcrumbButton>
        </div>
      ))}
    </nav>
  );
}

function BreadcrumbButton({
  children,
  active,
  onClick,
  targetId,
  onDropItem,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  targetId: ParentId;
  onDropItem?: (sourceItemId: string, targetFolderId: ParentId) => void;
}) {
  const [dragOver, setDragOver] = React.useState(false);

  // See item-card.tsx — DataTransfer is in protected mode during dragover,
  // we can only inspect `types` here. Deeper checks happen at drop time.
  const couldAccept = (e: React.DragEvent): boolean => {
    if (!onDropItem) return false;
    return isInternalItemDrag(e.dataTransfer);
  };

  return (
    <button
      onClick={onClick}
      onDragOver={(e) => {
        if (!couldAccept(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!couldAccept(e)) return;
        e.preventDefault();
        setDragOver(false);
        const payload = readItemDrag(e.dataTransfer);
        if (!payload || !onDropItem) return;
        // Validation only possible now that we can read the payload.
        if (payload.parentId === targetId) return; // no-op
        if (payload.kind === "folder" && payload.id === targetId) return; // self
        onDropItem(payload.id, targetId);
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        dragOver && "bg-primary/15 text-foreground ring-1 ring-primary/40",
      )}
    >
      {children}
    </button>
  );
}

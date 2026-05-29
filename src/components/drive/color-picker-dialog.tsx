"use client";

import * as React from "react";
import { Check, Folder } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  FOLDER_COLOR_PRESETS,
  folderIconClass,
  type FolderColor,
} from "@/lib/folder-colors";
import { setFolderColor, type DriveItem } from "@/lib/storage";
import { toast } from "sonner";

type Props = {
  item: DriveItem | null;
  onOpenChange: (open: boolean) => void;
};

export function ColorPickerDialog({ item, onOpenChange }: Props) {
  const open = item !== null && item.kind === "folder";
  const current = item?.kind === "folder" ? (item.color ?? "amber") : "amber";

  if (!item || item.kind !== "folder") return null;

  const apply = async (color: FolderColor | undefined) => {
    try {
      await setFolderColor(item.driveId, item.id, color);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="size-4 text-muted-foreground" />
            Couleur de « {item.name} »
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-6 gap-2">
          {(Object.keys(FOLDER_COLOR_PRESETS) as FolderColor[]).map((key) => {
            const { label, swatch } = FOLDER_COLOR_PRESETS[key];
            const isActive = current === key;
            return (
              <button
                key={key}
                title={label}
                onClick={() => apply(key === "amber" ? undefined : key)}
                className={cn(
                  "group relative flex size-8 items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  swatch,
                )}
              >
                {isActive && (
                  <Check className="size-4 text-white drop-shadow" />
                )}
              </button>
            );
          })}
        </div>

        {/* Preview */}
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/30 p-3">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              folderIconClass(current),
            )}
          >
            <Folder className="size-4" />
          </div>
          <span className="text-sm font-medium">{item.name}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

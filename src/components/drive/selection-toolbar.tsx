"use client";

import { FolderInput, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  count: number;
  onDelete: () => void;
  onMove: () => void;
  onTag: () => void;
  onClear: () => void;
  className?: string;
};

export function SelectionToolbar({
  count,
  onDelete,
  onMove,
  onTag,
  onClear,
  className,
}: Props) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2",
        "flex items-center gap-1 rounded-xl border border-border/60 bg-card/95 px-3 py-2 shadow-2xl backdrop-blur-sm",
        className,
      )}
    >
      <span className="mr-1 text-sm font-semibold tabular-nums">
        {count} sélectionné{count > 1 ? "s" : ""}
      </span>

      <div className="mx-1 h-4 w-px bg-border/60" />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
        Supprimer
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        onClick={onMove}
      >
        <FolderInput className="size-3.5" />
        Déplacer
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        onClick={onTag}
      >
        <Tag className="size-3.5" />
        Tagger
      </Button>

      <div className="mx-1 h-4 w-px bg-border/60" />

      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        onClick={onClear}
        title="Désélectionner tout (Echap)"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

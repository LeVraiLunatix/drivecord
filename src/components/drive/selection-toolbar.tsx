"use client";

import { Download, FolderInput, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  count: number;
  onDownload: () => void;
  onDelete: () => void;
  onMove: () => void;
  onTag: () => void;
  onClear: () => void;
  className?: string;
};

export function SelectionToolbar({
  count,
  onDownload,
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
        // Ancrée en bas à droite (hors du centre) pour dégager la liste ; le
        // décalage vertical (bottom) est ajusté par globals.css au-dessus de la
        // tab bar native. Voir aussi la marge de scroll pb-36 dans explorer.tsx.
        "selection-toolbar fixed bottom-6 right-4 z-50",
        "flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/95 px-2 py-1.5 shadow-2xl backdrop-blur-sm sm:gap-1 sm:px-3 sm:py-2",
        className,
      )}
    >
      <span className="mr-1 shrink-0 text-sm font-semibold tabular-nums">
        {count}
        <span className="hidden sm:inline"> sélectionné{count > 1 ? "s" : ""}</span>
      </span>

      <div className="mx-1 h-4 w-px bg-border/60" />

      {/* Download as ZIP */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 sm:px-2.5"
        onClick={onDownload}
        title="Télécharger (ZIP)"
      >
        <Download className="size-3.5" />
        <span className="hidden sm:inline">Télécharger</span>
      </Button>

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive sm:px-2.5"
        onClick={onDelete}
        title="Supprimer"
      >
        <Trash2 className="size-3.5" />
        <span className="hidden sm:inline">Supprimer</span>
      </Button>

      {/* Move */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 sm:px-2.5"
        onClick={onMove}
        title="Déplacer"
      >
        <FolderInput className="size-3.5" />
        <span className="hidden sm:inline">Déplacer</span>
      </Button>

      {/* Tag */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 sm:px-2.5"
        onClick={onTag}
        title="Tagger"
      >
        <Tag className="size-3.5" />
        <span className="hidden sm:inline">Tagger</span>
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

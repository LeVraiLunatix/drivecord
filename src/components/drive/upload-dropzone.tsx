"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { entriesFromDataTransfer, type UploadEntry } from "@/lib/upload-folder";

/**
 * Whole-page drag&drop overlay.
 *
 * Wraps an area of the app. When the user drags files (or whole folders)
 * anywhere inside it, a translucent overlay appears. Dropping traverses any
 * dropped directories and calls `onEntries` with { file, path } entries.
 *
 * Uses a small counter to handle dragenter/dragleave correctly — naive
 * implementations flicker because every child fires dragleave when the
 * mouse enters it.
 */
type Props = {
  onEntries: (entries: UploadEntry[]) => void;
  children: React.ReactNode;
  /** Optional className applied to the outer wrapper. */
  className?: string;
};

export function UploadDropzone({ onEntries, children, className }: Props) {
  const [isOver, setIsOver] = React.useState(false);
  const counterRef = React.useRef(0);

  const onDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    counterRef.current += 1;
    if (counterRef.current === 1) setIsOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    counterRef.current -= 1;
    if (counterRef.current <= 0) {
      counterRef.current = 0;
      setIsOver(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    counterRef.current = 0;
    setIsOver(false);
    // Traverse folders (if any) into { file, path } entries.
    entriesFromDataTransfer(e.dataTransfer).then((entries) => {
      if (entries.length) onEntries(entries);
    });
  };

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
      {isOver && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary/70 bg-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-background/90 px-10 py-8 shadow-2xl ring-1 ring-primary/20">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30">
              <UploadCloud className="size-7" />
            </span>
            <p className="text-lg font-semibold">Dépose pour envoyer</p>
            <p className="text-xs text-muted-foreground">
              Chiffré sur ton appareil, puis envoyé sur ton Discord
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function hasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  // dragenter/over don't expose .files yet — check .types instead.
  return Array.from(dt.types).includes("Files");
}

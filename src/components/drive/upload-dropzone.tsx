"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Whole-page drag&drop overlay.
 *
 * Wraps an area of the app. When the user drags files anywhere inside it,
 * a translucent overlay appears. Dropping triggers `onFiles`.
 *
 * Uses a small counter to handle dragenter/dragleave correctly — naive
 * implementations flicker because every child fires dragleave when the
 * mouse enters it.
 */
type Props = {
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
  /** Optional className applied to the outer wrapper. */
  className?: string;
};

export function UploadDropzone({ onFiles, children, className }: Props) {
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
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
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
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-background/80 px-8 py-6 shadow-lg">
            <UploadCloud className="size-10 text-primary" />
            <p className="font-medium">Déposez pour uploader</p>
            <p className="text-xs text-muted-foreground">
              Les fichiers seront chunkés et envoyés sur Discord
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

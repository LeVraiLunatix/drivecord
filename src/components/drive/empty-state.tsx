"use client";

import * as React from "react";
import { Folder, type LucideIcon, UploadCloud } from "lucide-react";

type Props = {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** Optional call to action (button) shown under the text. */
  action?: React.ReactNode;
  /** Small secondary line, e.g. a keyboard hint. */
  hint?: string;
};

export function EmptyState({ title, description, icon: Icon = UploadCloud, action, hint }: Props) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border border-dashed border-border/60 bg-gradient-to-b from-card/40 to-transparent px-6 py-16 text-center">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-indigo-500/20 via-violet-500/15 to-fuchsia-500/20 blur-3xl" />
      <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-primary ring-1 ring-primary/20">
        <Icon className="size-8" />
      </div>
      <div className="space-y-1.5">
        <p className="text-lg font-semibold tracking-tight">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export const EmptyFolderIcon = Folder;

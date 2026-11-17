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
    <div className="cord-glass relative flex flex-col items-center justify-center gap-5 rounded-[var(--cord-radius-panel)] px-6 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-6" />
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

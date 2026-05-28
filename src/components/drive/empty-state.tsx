"use client";

import { Folder, type LucideIcon, UploadCloud } from "lucide-react";

type Props = {
  title: string;
  description: string;
  icon?: LucideIcon;
};

export function EmptyState({ title, description, icon: Icon = UploadCloud }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/50 bg-card/20 p-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export const EmptyFolderIcon = Folder;

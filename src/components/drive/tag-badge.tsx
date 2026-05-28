"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagPill } from "@/lib/tag-colors";

type Props = {
  tag: string;
  onRemove?: () => void;
  className?: string;
};

export function TagBadge({ tag, onRemove, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-medium leading-tight",
        tagPill(tag),
        className,
      )}
    >
      #{tag}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 opacity-60 hover:opacity-100 focus:outline-none"
          aria-label={`Retirer le tag ${tag}`}
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

/** Touche clavier (ex. <Kbd>⌘</Kbd> <Kbd>K</Kbd>). */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[0.7rem] font-medium text-foreground shadow-[0_1px_0_var(--border)]",
        className
      )}
      {...props}
    />
  );
}

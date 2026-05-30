"use client";

import { Construction } from "lucide-react";

/**
 * Thin top banner flagging the app as beta. Sits above the header.
 * Honours the iOS safe-area top so it isn't hidden under the status bar.
 */
export function BetaBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500/15 via-violet-500/15 to-fuchsia-500/15 px-4 py-1.5 text-center text-xs text-muted-foreground">
      <Construction className="size-3.5 shrink-0 text-primary" />
      <span>
        <strong className="font-medium text-foreground">Version bêta</strong>
        {" "}— des bugs peuvent encore survenir, c&apos;est normal.
      </span>
    </div>
  );
}

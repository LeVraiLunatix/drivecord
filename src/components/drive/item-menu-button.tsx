"use client";

import * as React from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DriveItem } from "@/lib/storage";
import {
  presentItemMenuNative,
  nativeMenuAvailable,
  type ItemAction,
  type MenuEntry,
} from "./item-menu";

type Props = {
  item: DriveItem;
  menu: MenuEntry[];
  /** Title shown atop the native action sheet (the item's name). */
  name: string;
  onAction: (action: ItemAction, item: DriveItem) => void;
  /** Extra classes for the trigger button (e.g. overlay styling on thumbnails). */
  className?: string;
};

/**
 * The "⋮" actions button for a file/folder. In the native iOS app it opens a
 * real Liquid Glass action sheet; on the web it falls back to the dropdown.
 */
export function ItemMenuButton({ item, menu, name, onAction, className }: Props) {
  const [useNative, setUseNative] = React.useState(false);
  React.useEffect(() => { setUseNative(nativeMenuAvailable()); }, []);

  if (useNative) {
    return (
      <Button
        size="icon"
        variant="ghost"
        className={cn("size-7 opacity-0 transition-opacity group-hover:opacity-100", className)}
        onClick={async (e) => {
          e.stopPropagation();
          const action = await presentItemMenuNative(menu, name);
          if (action) onAction(action, item);
        }}
      >
        <MoreVertical className="size-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "size-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {menu.map((m, i) =>
          m.kind === "separator" ? (
            <DropdownMenuSeparator key={`s-${i}`} />
          ) : (
            <DropdownMenuItem
              key={m.action}
              onSelect={() => onAction(m.action, item)}
              className={m.destructive ? "text-destructive focus:text-destructive" : undefined}
            >
              {m.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

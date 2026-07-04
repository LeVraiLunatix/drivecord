"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  presentItemMenuNative,
  nativeMenuAvailable,
  type MenuEntry,
} from "./item-menu";

export type BulkAction = "download" | "delete" | "move" | "tag";

type Props = {
  count: number;
  onAction: (action: BulkAction) => void;
  className?: string;
};

const MENU: MenuEntry[] = [
  { kind: "item", label: "Télécharger (ZIP)", action: "download" },
  { kind: "item", label: "Déplacer vers…", action: "move" },
  { kind: "item", label: "Gérer les tags…", action: "tag" },
  { kind: "separator" },
  { kind: "item", label: "Supprimer", action: "delete", destructive: true },
];

/**
 * Bulk-actions trigger for the current selection, anchored top-right of the
 * explorer. Replaces the old floating bottom toolbar (which overlapped the
 * last rows / the native tab bar). On the native iOS app it opens a real
 * Liquid Glass action sheet; on the web it falls back to a dropdown menu.
 */
export function SelectionActionsMenu({ count, onAction, className }: Props) {
  const [useNative, setUseNative] = React.useState(false);
  React.useEffect(() => {
    setUseNative(nativeMenuAvailable());
  }, []);

  if (count === 0) return null;

  const title = `${count} élément${count > 1 ? "s" : ""}`;

  if (useNative) {
    return (
      <Button
        size="sm"
        variant="outline"
        className={cn("h-8 gap-1.5", className)}
        onClick={async () => {
          const action = await presentItemMenuNative(MENU, title);
          if (action) onAction(action as BulkAction);
        }}
      >
        Actions
        <ChevronDown className="size-3.5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className={cn("h-8 gap-1.5", className)}>
          Actions
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {MENU.map((m, i) =>
          m.kind === "separator" ? (
            <DropdownMenuSeparator key={`s-${i}`} />
          ) : (
            <DropdownMenuItem
              key={m.action}
              onSelect={() => onAction(m.action as BulkAction)}
              className={
                m.destructive ? "text-destructive focus:text-destructive" : undefined
              }
            >
              {m.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

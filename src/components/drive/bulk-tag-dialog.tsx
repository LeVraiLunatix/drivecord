"use client";

import * as React from "react";
import { Plus, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addFileTag, useAllTags, type DriveItem } from "@/lib/storage";
import { toast } from "sonner";

type Props = {
  items: DriveItem[];
  driveId: string | null;
  onOpenChange: (open: boolean) => void;
};

export function BulkTagDialog({ items, driveId, onOpenChange }: Props) {
  const open = items.length > 0;
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const allTags = useAllTags(driveId);
  const fileItems = items.filter((i) => i.kind === "file");

  React.useEffect(() => {
    if (open) {
      setInput("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const apply = async () => {
    const tag = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#+/, "");
    if (!tag) return;
    setBusy(true);
    try {
      await Promise.all(fileItems.map((item) => addFileTag(item.id, tag)));
      toast.success(
        `Tag #${tag} ajouté à ${fileItems.length} fichier${fileItems.length > 1 ? "s" : ""}`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = (allTags ?? []).map((t) => t.tag);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4 text-muted-foreground" />
            Tagger {fileItems.length} fichier{fileItems.length > 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
              placeholder="Nom du tag…"
              list="bulk-tag-suggestions"
              autoComplete="off"
              disabled={busy}
              className="flex-1"
            />
            <datalist id="bulk-tag-suggestions">
              {suggestions.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.slice(0, 8).map((t) => (
                <button
                  key={t}
                  onClick={() => setInput(t)}
                  className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={apply} disabled={busy || !input.trim()}>
            <Plus className="size-4" />
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { Plus, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagBadge } from "./tag-badge";
import { addFileTag, removeFileTag, useAllTags, useFile, type DriveItem } from "@/lib/storage";
import { toast } from "sonner";

type Props = {
  item: DriveItem | null;
  onOpenChange: (open: boolean) => void;
};

export function TagDialog({ item, onOpenChange }: Props) {
  const open = item !== null && item.kind === "file";
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Live file state — reacts instantly when tags are added/removed.
  const liveFile = useFile(item?.driveId ?? null, item?.kind === "file" ? item.id : null);
  const currentTags = liveFile?.tags ?? (item?.kind === "file" ? item.tags : []);

  // All existing tags in the drive for autocomplete
  const allTags = useAllTags(item?.driveId ?? null);

  const suggestions = React.useMemo(() => {
    if (!allTags) return [];
    const q = input.trim().toLowerCase();
    return allTags
      .map((t) => t.tag)
      .filter((t) => !currentTags.includes(t) && (q === "" || t.includes(q)));
  }, [allTags, currentTags, input]);

  React.useEffect(() => {
    if (open) {
      setInput("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, item?.id]);

  if (!item || item.kind !== "file") return null;

  const addTag = async (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#+/, "");
    if (!tag || currentTags.includes(tag)) return;
    setBusy(true);
    try {
      await addFileTag(item.driveId, item.id, tag);
      setInput("");
      inputRef.current?.focus();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeTag = async (tag: string) => {
    try {
      await removeFileTag(item.driveId, item.id, tag);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(input);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4 text-muted-foreground" />
            Tags — {item.filename}
          </DialogTitle>
        </DialogHeader>

        {/* Current tags */}
        <div className="min-h-8">
          {currentTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun tag pour l'instant.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {currentTags.map((tag) => (
                <TagBadge key={tag} tag={tag} onRemove={() => removeTag(tag)} />
              ))}
            </div>
          )}
        </div>

        {/* Add tag input */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ajouter un tag…"
                className="pr-8"
                list="tag-suggestions"
                autoComplete="off"
                disabled={busy}
              />
              {/* native datalist for autocomplete */}
              <datalist id="tag-suggestions">
                {suggestions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <Button
              size="icon"
              variant="secondary"
              onClick={() => addTag(input)}
              disabled={busy || !input.trim()}
              title="Ajouter"
            >
              <Plus className="size-4" />
            </Button>
          </div>

          {/* Suggestion pills */}
          {suggestions.length > 0 && input.trim() === "" && (
            <div className="flex flex-wrap gap-1">
              {suggestions.slice(0, 8).map((t) => (
                <button
                  key={t}
                  onClick={() => addTag(t)}
                  className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format";
import { useUploadQueue, type QueueStatus } from "@/lib/upload-queue";

/**
 * Floating panel showing all queued/in-progress/finished uploads.
 *
 * Hides itself when the queue is empty. Collapsible so it doesn't get in the
 * user's way when many files are queued.
 */
export function UploadQueuePanel() {
  const items = useUploadQueue((s) => s.items);
  const cancel = useUploadQueue((s) => s.cancel);
  const remove = useUploadQueue((s) => s.remove);
  const clearFinished = useUploadQueue((s) => s.clearFinished);
  const [collapsed, setCollapsed] = React.useState(false);

  if (items.length === 0) return null;

  const inProgress = items.filter(
    (i) => i.status === "pending" || i.status === "uploading",
  );
  const finishedCount = items.length - inProgress.length;

  return (
    <div className="fixed bottom-4 right-2 z-40 w-[min(20rem,calc(100vw-1rem))] rounded-xl border border-border/60 bg-card/95 shadow-lg backdrop-blur sm:right-4">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {inProgress.length > 0 ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="size-4 text-green-500" />
          )}
          <span>
            {inProgress.length > 0
              ? `Upload en cours (${inProgress.length})`
              : `Uploads terminés (${finishedCount})`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {finishedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={clearFinished}
            >
              Effacer
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Déplier" : "Replier"}
          >
            {collapsed ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <ul className="max-h-72 divide-y divide-border/50 overflow-y-auto">
          {items.map((it) => (
            <li key={it.id} className="px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <StatusIcon status={it.status} />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs"
                  title={it.fileName}
                >
                  {it.fileName}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-muted-foreground"
                  onClick={() =>
                    it.status === "uploading" || it.status === "pending"
                      ? cancel(it.id)
                      : remove(it.id)
                  }
                  aria-label="Annuler / Retirer"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              {it.status === "uploading" && it.progress && (
                <div className="mt-1.5 space-y-1">
                  <Progress
                    value={
                      (it.progress.loaded /
                        Math.max(1, it.progress.total)) *
                      100
                    }
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {formatBytes(it.progress.loaded)} /{" "}
                    {formatBytes(it.progress.total)} · chunk{" "}
                    {it.progress.chunksDone}/{it.progress.chunksTotal}
                  </p>
                </div>
              )}
              {it.status === "error" && it.error && (
                <p className="mt-1 text-[10px] text-destructive">{it.error}</p>
              )}
              {it.status === "pending" && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  En attente — {formatBytes(it.fileSize)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: QueueStatus }) {
  if (status === "uploading")
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />;
  if (status === "done")
    return <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />;
  if (status === "error")
    return <XCircle className="size-3.5 shrink-0 text-destructive" />;
  if (status === "cancelled")
    return <X className="size-3.5 shrink-0 text-muted-foreground" />;
  return (
    <div
      className={cn(
        "size-3.5 shrink-0 rounded-full border-2 border-muted-foreground/30",
      )}
    />
  );
}

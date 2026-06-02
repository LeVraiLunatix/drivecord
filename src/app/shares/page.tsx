"use client";

import * as React from "react";
import useSWR from "swr";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { toast } from "sonner";
import {
  Link2,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Download,
  Lock,
  CalendarClock,
  Loader2,
  FileWarning,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/back-button";
import { formatBytes } from "@/lib/utils/format";

type Share = {
  token: string;
  driveName: string | null;
  filename: string;
  size: number;
  missing: boolean;
  hasPassword: boolean;
  expiresAt: number | null;
  expired: boolean;
  downloads: number;
  createdAt: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** "N'expire jamais" / "Expire dans X jour(s)" / "Expire bientôt". */
function expiryLabel(expiresAt: number | null): string {
  if (!expiresAt) return "N'expire jamais";
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "Expiré";
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 1) {
    const hours = Math.ceil(ms / 3_600_000);
    return hours <= 1 ? "Expire dans moins d'1h" : `Expire dans ${hours}h`;
  }
  return `Expire dans ${days} jours`;
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

export default function SharesPage() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;
  const { data, isLoading, mutate } = useSWR<{ shares: Share[] }>(
    "/api/account/shares",
    fetcher,
    { revalidateOnFocus: false },
  );
  const [copied, setCopied] = React.useState<string | null>(null);

  const shares = data?.shares ?? [];
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const totalDownloads = shares.reduce((a, s) => a + s.downloads, 0);
  const activeCount = shares.filter((s) => !s.expired && !s.missing).length;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}/s/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 1800);
    } catch { toast.error("Copie impossible"); }
  };

  const revoke = async (token: string) => {
    try {
      await fetch(`/api/account/shares/${token}`, { method: "DELETE" });
      toast.success("Lien révoqué");
      mutate();
    } catch { toast.error("Échec"); }
  };

  return (
    <motion.div
      variants={v ?? container}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 px-5 pb-20 sm:px-6"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <motion.div variants={v ?? item}>
        <BackButton fallback="/drive" className="w-fit" />
      </motion.div>

      <motion.header variants={v ?? item} className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Link2 className="size-7 text-primary" />
          Liens partagés
        </h1>
        <p className="text-sm text-muted-foreground">
          {shares.length} lien(s) · {activeCount} actif(s) · {totalDownloads} téléchargement(s)
        </p>
      </motion.header>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && shares.length === 0 && (
        <motion.div variants={v ?? item} className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Link2 className="size-8" />
          <p className="text-sm">Aucun lien partagé. Partage un fichier via son menu (« Partager par lien »).</p>
        </motion.div>
      )}

      <div className="space-y-3">
        {shares.map((s) => (
          <motion.div key={s.token} variants={v ?? item}>
            <Card className={s.expired || s.missing ? "opacity-60" : undefined}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {s.missing && <FileWarning className="size-4 shrink-0 text-destructive" />}
                      {s.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.driveName ? `${s.driveName} · ` : ""}{formatBytes(s.size)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Badge variant="secondary" className="gap-1">
                      <Download className="size-3" /> {s.downloads}
                    </Badge>
                    {s.hasPassword && <Badge variant="secondary" className="gap-1"><Lock className="size-3" /></Badge>}
                    {s.expired ? (
                      <Badge variant="outline" className="text-destructive">Expiré</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                        <CalendarClock className="size-3" />
                        {expiryLabel(s.expiresAt)}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 overflow-hidden rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
                  <code className="block min-w-0 flex-1 truncate font-mono text-xs">{origin}/s/{s.token}</code>
                  <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => copy(s.token)} title="Copier">
                    {copied === s.token ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                  <Button asChild size="icon" variant="ghost" className="size-7 shrink-0" title="Ouvrir">
                    <a href={`/s/${s.token}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" /></a>
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => revoke(s.token)} title="Révoquer">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

"use client";

import * as React from "react";
import useSWR from "swr";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  BarChart3,
  HardDrive,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  Code,
  Table,
  File,
  Folder,
  Star,
  Ruler,
  Trash2,
  CalendarClock,
  Tag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/back-button";
import { formatBytes } from "@/lib/utils/format";
import { useActiveDrive } from "@/lib/storage";
import type { FileKind } from "@/lib/utils/file-icons";

type Stats = {
  fileCount: number;
  totalBytes: number;
  folderCount: number;
  favoriteCount: number;
  avgBytes: number;
  firstUpload: number | null;
  lastUpload: number | null;
  trashedCount: number;
  trashedBytes: number;
  byKind: { kind: FileKind; count: number; bytes: number }[];
  topFiles: { filename: string; size: number }[];
  topTags: { tag: string; count: number }[];
  uploadsByMonth: { month: string; label: string; count: number }[];
};

function fmtDate(ts: number | null): string {
  return ts ? new Date(ts).toLocaleDateString("fr", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const KIND_META: Record<string, { label: string; color: string; Icon: typeof File }> = {
  image: { label: "Images", color: "#34d399", Icon: ImageIcon },
  video: { label: "Vidéos", color: "#60a5fa", Icon: Film },
  audio: { label: "Audio", color: "#fbbf24", Icon: Music },
  pdf: { label: "PDF", color: "#f87171", Icon: FileText },
  doc: { label: "Documents", color: "#818cf8", Icon: FileText },
  spreadsheet: { label: "Tableurs", color: "#4ade80", Icon: Table },
  archive: { label: "Archives", color: "#fb923c", Icon: FileArchive },
  code: { label: "Code", color: "#a78bfa", Icon: Code },
  text: { label: "Texte", color: "#94a3b8", Icon: FileText },
  other: { label: "Autres", color: "#71717a", Icon: File },
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

function StatTile({
  Icon,
  label,
  value,
  sub,
  color,
}: {
  Icon: typeof File;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <Icon className="size-4" style={{ color }} />
      <p className="mt-2 truncate text-lg font-bold leading-tight">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{sub ?? label}</p>
    </div>
  );
}

export default function StatsPage() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;
  const drive = useActiveDrive();
  const { data, isLoading } = useSWR<Stats>(
    drive?.id ? `/api/drive/${drive.id}/stats` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const cap = React.useMemo(() => {
    const ten = 10 * 1024 ** 3;
    if (!data) return ten;
    return Math.max(ten, data.totalBytes * 1.5);
  }, [data]);

  const pct = data ? Math.min(100, (data.totalBytes / cap) * 100) : 0;
  const maxKindBytes = data?.byKind[0]?.bytes ?? 1;
  const maxMonth = Math.max(1, ...(data?.uploadsByMonth.map((m) => m.count) ?? [1]));

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
          <BarChart3 className="size-7 text-primary" />
          Statistiques
        </h1>
        <p className="text-sm text-muted-foreground">
          {drive ? `Drive « ${drive.name} »` : "Aucun drive sélectionné"}
        </p>
      </motion.header>

      {!drive && (
        <motion.p variants={v ?? item} className="text-sm text-muted-foreground">
          Ouvre un drive pour voir ses statistiques.
        </motion.p>
      )}

      {drive && isLoading && (
        <div className="flex justify-center py-10">
          <div className="size-7 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      )}

      {data && (
        <>
          {/* Total */}
          <motion.div variants={v ?? item}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HardDrive className="size-4 text-muted-foreground" />
                  Stockage utilisé
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-bold">{formatBytes(data.totalBytes)}</span>
                  <span className="text-sm text-muted-foreground">
                    {data.fileCount} fichier{data.fileCount > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(data.totalBytes)} sur ~{formatBytes(cap)}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Key figures */}
          <motion.div variants={v ?? item} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile Icon={Folder} label="Dossiers" value={String(data.folderCount)} color="#60a5fa" />
            <StatTile Icon={Star} label="Favoris" value={String(data.favoriteCount)} color="#fbbf24" />
            <StatTile Icon={Ruler} label="Taille moy." value={formatBytes(data.avgBytes)} color="#a78bfa" />
            <StatTile
              Icon={Trash2}
              label="Corbeille"
              value={data.trashedCount > 0 ? formatBytes(data.trashedBytes) : "0"}
              sub={data.trashedCount > 0 ? `${data.trashedCount} fichier(s)` : undefined}
              color="#f87171"
            />
          </motion.div>

          {/* Date range */}
          {data.firstUpload && (
            <motion.div variants={v ?? item}>
              <Card>
                <CardContent className="flex items-center gap-3 p-4 text-sm">
                  <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">Activité du</span>
                  <span className="font-medium">{fmtDate(data.firstUpload)}</span>
                  <span className="text-muted-foreground">au</span>
                  <span className="font-medium">{fmtDate(data.lastUpload)}</span>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Upload activity (last 6 months) */}
          {data.fileCount > 0 && (
            <motion.div variants={v ?? item}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Ajouts par mois</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex h-32 items-end justify-between gap-2">
                    {data.uploadsByMonth.map((m) => (
                      <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {m.count > 0 ? m.count : ""}
                        </span>
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-fuchsia-500 transition-all"
                          style={{ height: `${Math.max(4, (m.count / maxMonth) * 100)}%`, minHeight: m.count > 0 ? 6 : 2, opacity: m.count > 0 ? 1 : 0.25 }}
                        />
                        <span className="text-[10px] uppercase text-muted-foreground/60">{m.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Top tags */}
          {data.topTags.length > 0 && (
            <motion.div variants={v ?? item}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tag className="size-4 text-muted-foreground" />
                    Tags les plus utilisés
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {data.topTags.map((t) => (
                    <Badge key={t.tag} variant="secondary" className="gap-1.5">
                      {t.tag}
                      <span className="text-muted-foreground">{t.count}</span>
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* By kind */}
          {data.byKind.length > 0 && (
            <motion.div variants={v ?? item}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Répartition par type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.byKind.map((k) => {
                    const meta = KIND_META[k.kind] ?? KIND_META.other;
                    const barPct = Math.max(3, (k.bytes / maxKindBytes) * 100);
                    return (
                      <div key={k.kind} className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <meta.Icon className="size-4 shrink-0" style={{ color: meta.color }} />
                          <span className="font-medium">{meta.label}</span>
                          <span className="text-muted-foreground">· {k.count}</span>
                          <span className="ml-auto text-muted-foreground">{formatBytes(k.bytes)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${barPct}%`, backgroundColor: meta.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Top files */}
          {data.topFiles.length > 0 && (
            <motion.div variants={v ?? item}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Fichiers les plus lourds</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.topFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="w-4 shrink-0 font-mono text-xs text-muted-foreground/50">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                      <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {data.fileCount === 0 && (
            <motion.p variants={v ?? item} className="py-8 text-center text-sm text-muted-foreground">
              Ce drive est vide. Uploade des fichiers pour voir les stats !
            </motion.p>
          )}
        </>
      )}
    </motion.div>
  );
}

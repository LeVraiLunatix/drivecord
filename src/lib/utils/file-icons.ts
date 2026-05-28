import {
  Archive,
  AudioLines,
  Code,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * Map a file (mime + filename) to an icon + a tailwind color class.
 *
 * The mime sniffing is heuristic — browsers don't always populate the type
 * (e.g. for .heic, .epub). We fall back to extension matching.
 */
export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "spreadsheet"
  | "archive"
  | "code"
  | "text"
  | "other";

const EXT_TO_KIND: Record<string, FileKind> = {
  // images
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
  avif: "image", svg: "image", bmp: "image", heic: "image", heif: "image",
  // video
  mp4: "video", mkv: "video", mov: "video", webm: "video", avi: "video",
  // audio
  mp3: "audio", wav: "audio", flac: "audio", ogg: "audio", m4a: "audio",
  aac: "audio", opus: "audio",
  // docs
  pdf: "pdf",
  doc: "doc", docx: "doc", rtf: "doc", odt: "doc",
  // spreadsheets
  xls: "spreadsheet", xlsx: "spreadsheet", csv: "spreadsheet", ods: "spreadsheet",
  // archives
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive",
  gz: "archive", bz2: "archive", xz: "archive",
  // code
  js: "code", ts: "code", tsx: "code", jsx: "code", json: "code",
  py: "code", rb: "code", go: "code", rs: "code", java: "code",
  c: "code", cpp: "code", h: "code", hpp: "code", cs: "code",
  html: "code", css: "code", scss: "code",
  // text
  txt: "text", md: "text", log: "text",
};

const KIND_BY_MIME: Array<[RegExp, FileKind]> = [
  [/^image\//, "image"],
  [/^video\//, "video"],
  [/^audio\//, "audio"],
  [/^application\/pdf$/, "pdf"],
  [/^application\/(zip|x-7z-compressed|x-rar|x-tar|x-gzip|x-bzip2|x-xz)$/, "archive"],
  [/^application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml)/, "doc"],
  [/^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml)/, "spreadsheet"],
  [/^text\/(csv|tab-separated-values)/, "spreadsheet"],
  [/^application\/(json|javascript|typescript|xml)/, "code"],
  [/^text\/(html|css|x-python|x-c|markdown)/, "code"],
  [/^text\//, "text"],
];

/** Best-effort kind detection. */
export function kindOf(filename: string, mimeType?: string): FileKind {
  if (mimeType) {
    for (const [re, k] of KIND_BY_MIME) if (re.test(mimeType)) return k;
  }
  const dot = filename.lastIndexOf(".");
  if (dot > 0) {
    const ext = filename.slice(dot + 1).toLowerCase();
    if (EXT_TO_KIND[ext]) return EXT_TO_KIND[ext];
  }
  return "other";
}

const ICONS: Record<FileKind, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  pdf: FileText,
  doc: FileText,
  spreadsheet: FileSpreadsheet,
  archive: Archive,
  code: Code,
  text: FileText,
  other: FileIcon,
};

/** Tailwind text color class for the icon background. */
const COLORS: Record<FileKind, string> = {
  image: "bg-pink-500/15 text-pink-400",
  video: "bg-purple-500/15 text-purple-400",
  audio: "bg-amber-500/15 text-amber-400",
  pdf: "bg-red-500/15 text-red-400",
  doc: "bg-blue-500/15 text-blue-400",
  spreadsheet: "bg-emerald-500/15 text-emerald-400",
  archive: "bg-orange-500/15 text-orange-400",
  code: "bg-cyan-500/15 text-cyan-400",
  text: "bg-zinc-500/15 text-zinc-400",
  other: "bg-zinc-500/15 text-zinc-400",
};

export function iconFor(filename: string, mimeType?: string) {
  const kind = kindOf(filename, mimeType);
  return { Icon: ICONS[kind], colorClass: COLORS[kind], kind };
}

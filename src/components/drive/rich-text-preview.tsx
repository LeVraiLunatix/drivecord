"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MARKDOWN_EXTS = new Set(["md", "markdown", "mdx"]);

/** Map common file extensions to highlight.js language ids. */
const EXT_LANG: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", json: "json", jsonc: "json",
  html: "xml", htm: "xml", xml: "xml", svg: "xml", vue: "xml",
  css: "css", scss: "scss", sass: "scss", less: "less",
  py: "python", rb: "ruby", php: "php", go: "go", rs: "rust",
  java: "java", kt: "kotlin", swift: "swift", c: "c", h: "c",
  cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", cs: "csharp",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", env: "ini",
  sql: "sql", md: "markdown", dockerfile: "dockerfile",
  prisma: "javascript", lua: "lua", dart: "dart", r: "r",
};

function getExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/** Highlighted code block (highlight.js lazy-loaded). */
function CodeView({ text, ext }: { text: string; ext: string }) {
  const [html, setHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hljs = (await import("highlight.js")).default;
        const lang = EXT_LANG[ext];
        const result =
          lang && hljs.getLanguage(lang)
            ? hljs.highlight(text, { language: lang })
            : hljs.highlightAuto(text);
        if (!cancelled) setHtml(result.value);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => { cancelled = true; };
  }, [text, ext]);

  return (
    <div className="h-full w-full overflow-auto rounded border border-white/10 bg-zinc-900/80 shadow-2xl">
      <pre className="min-w-0 p-4 text-sm leading-relaxed">
        {html === null ? (
          <code className="whitespace-pre-wrap break-words font-mono text-zinc-100">{text}</code>
        ) : (
          <code
            className="hljs whitespace-pre font-mono"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </pre>
    </div>
  );
}

/** Rendered markdown. */
function MarkdownView({ text }: { text: string }) {
  return (
    <div className="h-full w-full overflow-auto rounded border border-white/10 bg-zinc-900/80 p-5 shadow-2xl sm:p-7">
      <div className="md-body mx-auto max-w-3xl text-zinc-100">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

/**
 * Rich preview for text-based files:
 *  - .md / .markdown → rendered markdown
 *  - source code     → syntax-highlighted
 *  - plain text      → monospace
 */
export function RichTextPreview({ text, filename }: { text: string; filename: string }) {
  const ext = getExt(filename);
  if (MARKDOWN_EXTS.has(ext)) return <MarkdownView text={text} />;
  return <CodeView text={text} ext={ext} />;
}

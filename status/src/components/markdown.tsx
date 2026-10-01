import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ALLOWED = ["p", "br", "strong", "em", "del", "code", "pre", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr"];

/** Only absolute http(s) links, mailto, and same-site paths: no `javascript:`, no `data:`. */
export function safeUrl(url: string): string {
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(url.trim()) ? url : "";
}

/**
 * Renders Markdown from the repository's own files (changelog, incidents). Raw HTML is never rendered
 * (react-markdown escapes it), elements are limited to an allow-list, headings are demoted so a
 * document can't outrank the page's own titles, and links open safely.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-lite">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={ALLOWED}
        unwrapDisallowed
        skipHtml
        urlTransform={safeUrl}
        components={{
          h1: "h3",
          h2: "h3",
          h5: "h4",
          h6: "h4",
          a: ({ href, children: c }) =>
            href?.startsWith("/") || href?.startsWith("#") ? <a href={href}>{c}</a> : <a href={href} target="_blank" rel="noopener noreferrer">{c}</a>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

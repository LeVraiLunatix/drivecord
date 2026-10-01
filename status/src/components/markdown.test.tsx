import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, safeUrl } from "./markdown";

const render = (md: string) => renderToStaticMarkup(<Markdown>{md}</Markdown>);

describe("Markdown (changelog and incident text)", () => {
  it("never renders raw HTML", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://evil.example"></iframe>\n\n**ok**');
    expect(html).not.toMatch(/<script|<img|<iframe|onerror/i);
    expect(html).toContain("<strong>ok</strong>");
  });

  it("drops dangerous link targets", () => {
    const html = render("[a](javascript:alert(1)) [b](data:text/html;base64,AAAA) [c](https://example.com)");
    expect(html).not.toMatch(/javascript:|data:text/i);
    expect(html).toContain('href="https://example.com"');
  });

  it("opens external links safely and keeps internal ones in place", () => {
    const html = render("[out](https://example.com) [in](/history)");
    expect(html).toMatch(/<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">out<\/a>/);
    expect(html).toMatch(/<a href="\/history">in<\/a>/);
  });

  it("does not render images or other elements outside the allow-list", () => {
    const html = render("![alt](https://example.com/x.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<table");
  });

  it("demotes headings so a document cannot outrank the page titles", () => {
    const html = render("# Un\n\n## Deux");
    expect(html).not.toMatch(/<h1|<h2/);
    expect(html).toContain("<h3");
  });

  it("renders lists and inline code", () => {
    const html = render("- un\n- deux avec `code`");
    expect(html).toContain("<ul>");
    expect(html).toContain("<code>code</code>");
  });
});

describe("safeUrl", () => {
  it("allows http(s), mailto, same-site paths and anchors only", () => {
    for (const ok of ["https://a.b", "http://a.b", "mailto:a@b.c", "/x", "#y"]) expect(safeUrl(ok), ok).toBe(ok);
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:1", "data:text/html,x", "//evil.example", "vbscript:x", " javascript:alert(1)"]) expect(safeUrl(bad), bad).toBe("");
  });
});

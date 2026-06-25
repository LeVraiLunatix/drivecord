"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Heading = { id: string; text: string; level: 2 | 3 };

/** Table des matières « Sur cette page » avec surlignage au scroll. */
export function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = React.useState<Heading[]>([]);
  const [activeId, setActiveId] = React.useState<string>("");

  React.useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".docs-prose h2[id], .docs-prose h3[id]"
      )
    );

    setHeadings(
      nodes.map((n) => ({
        id: n.id,
        text: n.textContent?.trim() ?? "",
        level: n.tagName === "H2" ? 2 : 3,
      }))
    );

    if (nodes.length === 0) {
      setActiveId("");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: [0, 1] }
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length === 0) return null;

  return (
    <div className="text-sm">
      <p className="mb-3 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Sur cette page
      </p>
      <ul className="flex flex-col">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "-ml-px block border-l py-1 pl-3 transition-colors",
                h.level === 3 && "pl-6",
                activeId === h.id
                  ? "border-foreground font-medium text-foreground"
                  : "border-border/60 text-muted-foreground hover:border-foreground hover:text-foreground"
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

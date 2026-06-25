"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav } from "@/lib/docs/nav";
import { cn } from "@/lib/utils";

/**
 * Navigation latérale (réutilisée en desktop et dans le tiroir mobile).
 * `onNavigate` permet de fermer le tiroir au clic sur un lien.
 */
export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {docsNav.map((section) => (
        <div key={section.title}>
          <div className="mb-2 flex items-center gap-2 px-3 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <section.icon className="size-3.5" />
            {section.title}
          </div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              if (!item.ready) {
                return (
                  <li key={item.href}>
                    <span className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-1.5 text-sm text-muted-foreground/40">
                      {item.title}
                      <span className="text-[10px] uppercase tracking-wide">
                        Bientôt
                      </span>
                    </span>
                  </li>
                );
              }
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex rounded-lg px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-indigo-400 to-fuchsia-500" />
                    )}
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getBreadcrumb } from "@/lib/docs/nav";

/** Fil d'Ariane « Docs › Section › Page ». */
export function DocsBreadcrumb() {
  const pathname = usePathname();
  const crumb = getBreadcrumb(pathname);

  if (!crumb) return null;

  return (
    <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link href="/docs" className="transition-colors hover:text-foreground">
        Docs
      </Link>
      <ChevronRight className="size-3.5 shrink-0" />
      <span>{crumb.section}</span>
      <ChevronRight className="size-3.5 shrink-0" />
      <span className="text-foreground">{crumb.item.title}</span>
    </nav>
  );
}

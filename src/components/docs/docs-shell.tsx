"use client";

import * as React from "react";
import Link from "next/link";
import { CloudUpload, Menu, ArrowUpRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { DocsSidebar } from "./docs-sidebar";
import { DocsToc } from "./docs-toc";
import { DocsPager } from "./docs-pager";
import { DocsBreadcrumb } from "./docs-breadcrumb";

/** Coquille de la section docs : en-tête, sidebar, contenu et table des matières. */
export function DocsShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* ── En-tête ── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-2 px-4 sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Ouvrir le menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-80 max-w-[85vw] gap-0 overflow-y-auto p-0"
            >
              <SheetTitle className="px-4 pt-4">Documentation</SheetTitle>
              <div className="p-4">
                <DocsSidebar onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Link
            href="/docs"
            className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight"
          >
            <CloudUpload className="size-5 text-primary" />
            drivecord
            <span className="font-normal text-muted-foreground">/docs</span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href="/">Site</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/drive">
                Ouvrir l&apos;app
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Corps ── */}
      <div className="mx-auto flex w-full max-w-[88rem] flex-1 sm:px-6">
        {/* Sidebar desktop */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto py-8 pr-6 lg:block">
          <DocsSidebar />
        </aside>

        {/* Contenu */}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-0 lg:px-10">
          <div className="mx-auto max-w-3xl">
            <DocsBreadcrumb />
            {children}
            <DocsPager />
          </div>
        </main>

        {/* Table des matières */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 pl-6 xl:block">
          <DocsToc />
        </aside>
      </div>
    </div>
  );
}

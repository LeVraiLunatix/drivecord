"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, ArrowUpRight } from "lucide-react";
import { Accent } from "@/kitcord";
import { AuthBackground } from "@/components/auth/auth-background";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DocsSidebar } from "./docs-sidebar";
import { DocsToc } from "./docs-toc";
import { DocsPager } from "./docs-pager";
import { DocsBreadcrumb } from "./docs-breadcrumb";

/** Coquille de la section docs : en-tête, sidebar, contenu et table des matières. */
export function DocsShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="kit-page relative flex min-h-[100dvh] flex-col">
      <AuthBackground />
      {/* ── En-tête : la barre de verre du kit (elle gère la zone sûre de l'iPhone) ── */}
      <header className="cord-topbar !w-[min(88rem,calc(100%-2*var(--cord-space-gutter)))]">
        <div className="flex w-full items-center gap-2">
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

          <Link href="/docs" className="cord-wordmark min-h-11 items-center">
            <span>Drive<Accent>cord</Accent></span>
            <span className="cord-section">docs</span>
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
            <Link href="/drive" data-primary className="cord-button h-11 gap-1.5 whitespace-nowrap px-3 text-[15px] sm:px-4">
              Ouvrir l&apos;app
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Corps ── */}
      <div className="mx-auto flex w-full max-w-[88rem] flex-1 sm:px-6">
        {/* Sidebar desktop */}
        <aside className="sticky top-[var(--cord-topbar-offset)] hidden h-[calc(100dvh-var(--cord-topbar-offset))] w-64 shrink-0 overflow-y-auto py-8 pr-6 lg:block">
          <DocsSidebar />
        </aside>

        {/* Contenu */}
        <main className="tabbar-pad min-w-0 flex-1 px-4 py-8 sm:px-0 lg:px-10">
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

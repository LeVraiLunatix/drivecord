"use client";

import { useEffect, useRef, useState } from "react";
import type { TopBarLink } from "./TopBar";

/** Le menu des petits écrans : un bouton de verre qui ouvre une feuille de liens, sous le pouce. */
export function TopMenu({ links }: { links: TopBarLink[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="cord-menu" ref={root}>
      <button
        type="button"
        className="cord-menu-button"
        aria-expanded={open}
        aria-controls="cord-menu-panel"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="cord-menu-bars" aria-hidden="true" />
      </button>
      {open && (
        <nav id="cord-menu-panel" className="cord-menu-panel" aria-label="Liens utiles">
          {links.map((link, index) => (
            <a key={link.href} href={link.href} style={{ "--i": index } as React.CSSProperties} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

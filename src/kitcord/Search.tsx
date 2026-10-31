"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ElementType, KeyboardEvent } from "react";

export type SearchItem = {
  title: string;
  desc?: string;
  href: string;
};

export type SearchProps = {
  items: SearchItem[];
  placeholder?: string;
  /** Des exemples qui se tapent tout seuls dans la barre tant qu'on n'y a pas touché. */
  placeholders?: string[];
  /** Message affiché quand rien ne correspond. `{query}` est remplacé par la saisie. */
  emptyMessage?: string;
  /** Appelé quand on valide un résultat au clavier. Par défaut : ouvre le lien. */
  onSelect?: (item: SearchItem) => void;
  /** Composant de lien à utiliser pour les résultats (le `Link` de Next.js, par exemple). */
  linkAs?: ElementType;
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * La barre de recherche signature de Cord. Quand elle a le focus, la lumière du bas monte
 * (grâce à l'attribut data-cord-lights). La touche « / » y met le focus.
 */
export function Search({
  items,
  placeholder = "Chercher",
  placeholders,
  emptyMessage = "Rien pour « {query} ».",
  onSelect,
  linkAs: LinkTag = "a",
}: SearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // null : pas d'animation, on affiche le texte fixe
  const [typed, setTyped] = useState<string | null>(null);

  // les exemples se tapent, se lisent, s'effacent, puis le suivant arrive
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!placeholders?.length || open || query || reduce) {
      setTyped(null);
      return;
    }
    let index = 0;
    let pos = 0;
    let typing = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const word = placeholders[index % placeholders.length] ?? "";
      if (typing) {
        pos++;
        setTyped(word.slice(0, pos));
        if (pos >= word.length) {
          typing = false;
          timer = setTimeout(tick, 1700);
          return;
        }
        timer = setTimeout(tick, 55);
      } else {
        pos--;
        setTyped(word.slice(0, pos));
        if (pos <= 0) {
          typing = true;
          index++;
          timer = setTimeout(tick, 380);
          return;
        }
        timer = setTimeout(tick, 22);
      }
    };

    timer = setTimeout(tick, 1400);
    return () => clearTimeout(timer);
  }, [placeholders, open, query]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    return items.filter((item) =>
      normalize(`${item.title} ${item.desc ?? ""}`).includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // le résultat actif reste visible quand on descend au clavier
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function select(item: SearchItem) {
    if (onSelect) onSelect(item);
    else window.location.assign(item.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      select(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div
      className="cord-search"
      data-cord-lights
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <label className="cord-search-field">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="cord-sr-only">{placeholder}</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={typed ?? placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="cord-kbd" aria-hidden="true">/</span>
      </label>

      {open && (
        <div className="cord-results">
          <ul className="cord-results-list" id={listId} role="listbox" ref={listRef}>
            {results.length === 0 ? (
              <li className="cord-result-empty" role="presentation">
                {emptyMessage.replace("{query}", query)}
              </li>
            ) : (
              results.map((item, i) => (
                <li key={item.href} role="presentation">
                  <LinkTag
                    href={item.href}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e: MouseEvent) => e.preventDefault()}
                  >
                    <span className="cord-result-title">{item.title}</span>
                    {item.desc ? <span className="cord-result-desc">{item.desc}</span> : null}
                  </LinkTag>
                </li>
              ))
            )}
          </ul>
          {results.length > 0 && (
            <div className="cord-results-foot" aria-hidden="true">
              <span><kbd className="cord-kbd">↑</kbd><kbd className="cord-kbd">↓</kbd>naviguer</span>
              <span><kbd className="cord-kbd">↵</kbd>ouvrir</span>
              <span><kbd className="cord-kbd">échap</kbd>fermer</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

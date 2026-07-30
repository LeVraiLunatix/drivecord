"use client";

import * as React from "react";

/** Column count from window width, matching Tailwind's sm (640px) / xl (1280px). */
export function useResponsiveColumns(): number {
  const [columns, setColumns] = React.useState(1);
  React.useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setColumns(w >= 1280 ? 3 : w >= 640 ? 2 : 1);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return columns;
}

/**
 * True masonry layout: each item is placed into whichever column is
 * currently shortest (greedy bin-packing), unlike CSS multi-column which
 * fills one column completely before starting the next and can leave
 * columns wildly unbalanced.
 *
 * Renders items in normal single-column flow until the first layout pass
 * measures real heights (SSR/hydration-safe — no flash of absolutely
 * positioned content), then switches to absolute positioning. A
 * ResizeObserver re-packs whenever an item's height changes (e.g. a card
 * expanding into an "editing" state).
 */
export function Masonry({
  columns,
  gap = 24,
  children,
}: {
  /** Column count — pass a value that already accounts for your breakpoint. */
  columns: number;
  gap?: number;
  children: React.ReactNode[];
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<HTMLDivElement[]>([]);
  const [layout, setLayout] = React.useState<
    { top: number; left: string; width: string }[] | null
  >(null);
  const [containerHeight, setContainerHeight] = React.useState(0);

  const relayout = React.useCallback(() => {
    const items = itemRefs.current;
    if (items.length === 0) return;
    const colHeights = new Array(columns).fill(0);
    const colWidth = 100 / columns;
    const next = items.map((el) => {
      const col = colHeights.indexOf(Math.min(...colHeights));
      const top = colHeights[col];
      colHeights[col] += el.getBoundingClientRect().height + gap;
      return { top, left: `${col * colWidth}%`, width: `calc(${colWidth}% - ${(gap * (columns - 1)) / columns}px)` };
    });
    setLayout(next);
    setContainerHeight(Math.max(0, ...colHeights) - gap);
  }, [columns, gap]);

  React.useLayoutEffect(() => {
    relayout();
    const ro = new ResizeObserver(() => relayout());
    itemRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", relayout);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", relayout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayout, React.Children.count(children)]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={layout ? { height: containerHeight } : undefined}
    >
      {React.Children.map(children, (child, i) => (
        <div
          ref={(el) => {
            if (el) itemRefs.current[i] = el;
          }}
          className={layout ? "absolute transition-[top,left] duration-300 ease-out" : "mb-6"}
          style={
            layout?.[i]
              ? { top: layout[i].top, left: layout[i].left, width: layout[i].width }
              : undefined
          }
        >
          {child}
        </div>
      ))}
    </div>
  );
}

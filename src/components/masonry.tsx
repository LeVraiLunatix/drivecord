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
 * Masonry layout: items are assigned to a column once — greedy shortest-
 * column placement, balanced like a real masonry — then each column stacks
 * its own items independently.
 *
 * Column *assignment* only changes when the column count or item count
 * changes. Per-column *offsets* are recomputed live via ResizeObserver
 * whenever any item's height changes, but only within that item's own
 * column — so a card growing (e.g. adding an API key) pushes down whatever
 * is below it in its column without reshuffling unrelated columns.
 *
 * Renders items in normal single-column flow until the first layout pass
 * measures real heights (SSR/hydration-safe — no flash of absolutely
 * positioned content).
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
  const itemRefs = React.useRef<HTMLDivElement[]>([]);
  const columnOfRef = React.useRef<number[] | null>(null);
  const [layout, setLayout] = React.useState<
    { top: number; left: string; width: string }[] | null
  >(null);
  const [containerHeight, setContainerHeight] = React.useState(0);

  const colWidth = 100 / columns;
  const itemWidth = `calc(${colWidth}% - ${(gap * (columns - 1)) / columns}px)`;

  /** Cheap: keep the existing column assignment, just re-sum heights within each column. */
  const restack = React.useCallback(() => {
    const columnOf = columnOfRef.current;
    if (!columnOf) return;
    const colHeights = new Array(columns).fill(0);
    const next = itemRefs.current.map((el, i) => {
      const col = columnOf[i] ?? 0;
      const top = colHeights[col];
      colHeights[col] += (el?.getBoundingClientRect().height ?? 0) + gap;
      return { top, left: `${col * colWidth}%`, width: itemWidth };
    });
    setLayout(next);
    setContainerHeight(Math.max(0, ...colHeights) - gap);
  }, [columns, gap, colWidth, itemWidth]);

  /** Expensive: recompute which column each item belongs to (greedy shortest-column). */
  const reassignColumns = React.useCallback(() => {
    const items = itemRefs.current;
    if (items.length === 0) return;
    const colHeights = new Array(columns).fill(0);
    columnOfRef.current = items.map((el) => {
      const col = colHeights.indexOf(Math.min(...colHeights));
      colHeights[col] += (el?.getBoundingClientRect().height ?? 0) + gap;
      return col;
    });
    restack();
  }, [columns, gap, restack]);

  React.useLayoutEffect(() => {
    reassignColumns();
    const ro = new ResizeObserver(() => restack());
    itemRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", reassignColumns);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", reassignColumns);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reassignColumns, React.Children.count(children)]);

  return (
    <div className="relative" style={layout ? { height: containerHeight } : undefined}>
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

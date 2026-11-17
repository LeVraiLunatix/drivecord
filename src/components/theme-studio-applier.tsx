"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useTier } from "@/components/patreon/tier";
import { effectiveStudio, useStudio } from "@/lib/theme-studio";
import { useAppearance } from "@/lib/appearance";

/** Bonus Patreon VIP : un halo doux qui suit le curseur. N'agit que connecté avec le bon palier. */
export function ThemeStudioApplier() {
  const { status } = useSession();
  const { tier } = useTier();
  const raw = useStudio((s) => s.studio);
  const hue = useAppearance((s) => s.appearance.hue);
  const eff = React.useMemo(
    () => effectiveStudio(raw, status === "authenticated" ? tier : 0),
    [raw, tier, status],
  );
  return <>{eff.cursorGlow && <CursorGlow hue={eff.hue2 ?? hue ?? 285} />}</>;
}

function CursorGlow({ hue }: { hue: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let cx = x;
    let cy = y;
    let raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
    };
    const tick = () => {
      cx += (x - cx) * 0.14;
      cy += (y - cy) * 0.14;
      if (ref.current) ref.current.style.transform = `translate3d(${cx - 160}px, ${cy - 160}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[1] size-80 rounded-full"
      style={{
        background: `radial-gradient(circle, oklch(0.75 0.17 ${hue} / 0.22), transparent 65%)`,
        mixBlendMode: "screen",
      }}
    />
  );
}

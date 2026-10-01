"use client";

import { useEffect } from "react";
import { decodeDays, describeDay } from "@/lib/bar";

/**
 * One delegated handler for every uptime bar on the page: pointer hover/tap shows the day under the
 * cursor, and a focused bar answers ← → Home End. The selected day is also read out through a polite
 * live region. No per-bar state, no per-day DOM.
 */
export function BarInteractions() {
  useEffect(() => {
    const live = document.getElementById("bar-live");
    const cache = new WeakMap<HTMLElement, ReturnType<typeof decodeDays>>();
    const days = (bar: HTMLElement) => {
      let d = cache.get(bar);
      if (!d) cache.set(bar, (d = decodeDays(bar.dataset.days ?? "", bar.dataset.end ?? "")));
      return d;
    };

    const show = (bar: HTMLElement, index: number, announce: boolean) => {
      const all = days(bar);
      if (!all.length) return;
      const i = Math.max(0, Math.min(all.length - 1, index));
      const text = describeDay(all[i]!);
      const tip = bar.querySelector<HTMLElement>(".tip");
      const mark = bar.querySelector<HTMLElement>(".mark");
      if (!tip || !mark) return;
      bar.dataset.index = String(i);
      const w = bar.clientWidth;
      const cell = w / all.length;
      mark.hidden = false;
      mark.style.left = `${i * cell}px`;
      mark.style.width = `${Math.max(2, cell - 2)}px`;
      tip.textContent = text;
      tip.hidden = false;
      // Keep the tooltip inside the bar's width: no horizontal overflow on a phone.
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.max(0, Math.min(w - tw, i * cell + cell / 2 - tw / 2))}px`;
      if (announce && live) live.textContent = text;
    };

    const hide = (bar: HTMLElement) => {
      const tip = bar.querySelector<HTMLElement>(".tip");
      const mark = bar.querySelector<HTMLElement>(".mark");
      if (tip) tip.hidden = true;
      if (mark) mark.hidden = true;
    };

    const barOf = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.<HTMLElement>("[data-bar]") ?? null;
    const indexAt = (bar: HTMLElement, clientX: number) => {
      const r = bar.getBoundingClientRect();
      return Math.floor(((clientX - r.left) / r.width) * days(bar).length);
    };

    const onMove = (e: PointerEvent) => {
      const bar = barOf(e.target);
      if (bar) show(bar, indexAt(bar, e.clientX), false);
    };
    const onLeave = (e: PointerEvent) => {
      const bar = barOf(e.target);
      if (bar && document.activeElement !== bar) hide(bar);
    };
    const onDown = (e: PointerEvent) => {
      const bar = barOf(e.target);
      if (bar) show(bar, indexAt(bar, e.clientX), true);
      document.querySelectorAll<HTMLElement>("[data-bar]").forEach((b) => b !== bar && document.activeElement !== b && hide(b));
    };
    const onFocus = (e: FocusEvent) => {
      const bar = e.target as HTMLElement;
      if (bar.matches?.("[data-bar]")) show(bar, Number(bar.dataset.index ?? days(bar).length - 1), true);
    };
    const onBlur = (e: FocusEvent) => {
      const bar = e.target as HTMLElement;
      if (bar.matches?.("[data-bar]")) hide(bar);
    };
    const onKey = (e: KeyboardEvent) => {
      const bar = e.target as HTMLElement;
      if (!bar.matches?.("[data-bar]")) return;
      const n = days(bar).length;
      const cur = Number(bar.dataset.index ?? n - 1);
      const next = e.key === "ArrowLeft" ? cur - 1 : e.key === "ArrowRight" ? cur + 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
      if (next === null) return;
      e.preventDefault();
      show(bar, next, true);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerout", onLeave);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onLeave);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}

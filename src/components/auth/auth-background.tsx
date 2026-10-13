"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Subtle animated gradient background for the auth pages (login / register).
 * Soft brand-colored blobs that drift slowly. Cheaper than the WebGL
 * DarkVeil and consistent across both screens. Radial gradients, not blurred
 * discs: an animated `filter: blur(100px+)` made iPhone Safari crash the page.
 */
export function AuthBackground() {
  const reduce = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background">
      <motion.div
        className="absolute -left-40 -top-40 size-[30rem] rounded-full"
        style={{ background: "radial-gradient(circle closest-side, rgb(99 102 241 / 0.25), transparent)" }}
        animate={reduce ? {} : { x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 -right-40 size-[34rem] rounded-full"
        style={{ background: "radial-gradient(circle closest-side, rgb(217 70 239 / 0.2), transparent)" }}
        animate={reduce ? {} : { x: [0, -25, 0], y: [0, -20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/3 size-[32rem] -translate-x-1/2 -translate-y-1/4 rounded-full"
        style={{ background: "radial-gradient(circle closest-side, rgb(139 92 246 / 0.15), transparent)" }}
        animate={reduce ? {} : { scale: [1, 1.15, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

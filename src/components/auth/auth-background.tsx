"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Subtle animated gradient background for the auth pages (login / register).
 * Two soft brand-colored blobs that drift slowly. Cheaper than the WebGL
 * DarkVeil and consistent across both screens.
 */
export function AuthBackground() {
  const reduce = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background">
      <motion.div
        className="absolute -left-24 -top-24 size-72 rounded-full bg-indigo-500/25 blur-[100px]"
        animate={reduce ? {} : { x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-24 -right-24 size-80 rounded-full bg-fuchsia-500/20 blur-[110px]"
        animate={reduce ? {} : { x: [0, -25, 0], y: [0, -20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/3 size-64 -translate-x-1/2 rounded-full bg-violet-500/15 blur-[120px]"
        animate={reduce ? {} : { scale: [1, 1.15, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

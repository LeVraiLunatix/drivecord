import type { ReactNode } from "react";

export function Note({ children }: { children: ReactNode }) {
  return <aside className="cord-note">{children}</aside>;
}

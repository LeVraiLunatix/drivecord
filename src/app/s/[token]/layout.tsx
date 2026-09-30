import type { Metadata } from "next";

// The share page can carry a key in its URL fragment: never leak the URL through `Referer`.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}

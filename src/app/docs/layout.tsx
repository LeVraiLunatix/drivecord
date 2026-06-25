import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/docs-shell";

export const metadata: Metadata = {
  title: {
    default: "Documentation · Drivecord",
    template: "%s · Drivecord",
  },
  description:
    "Documentation complète de Drivecord : prise en main, guide d'utilisation, sécurité, chiffrement et auto-hébergement.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DocsShell>{children}</DocsShell>;
}

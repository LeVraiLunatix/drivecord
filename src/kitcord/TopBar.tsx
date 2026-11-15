import type { ElementType } from "react";
import { Accent } from "./Headline";
import { TopMenu } from "./TopMenu";

export type TopBarLink = {
  label: string;
  href: string;
};

export type TopBarProps = {
  /** Le nom de la suite ou de l'app. Il prend la couleur de la lumière. */
  brand?: string;
  /** Le complément, en gris : « développeurs », « Drivecord »… */
  section?: string;
  /** Adresse du logo. */
  homeHref?: string;
  links?: TopBarLink[];
  /** Composant de lien pour le logo (le `Link` de Next.js, par exemple). */
  homeLinkAs?: ElementType;
};

export function TopBar({
  brand = "Cord",
  section,
  homeHref = "/",
  links = [],
  homeLinkAs: HomeLink = "a",
}: TopBarProps) {
  return (
    <header className="cord-topbar">
      <HomeLink href={homeHref} className="cord-wordmark">
        <Accent>{brand}</Accent>
        {section ? <span className="cord-section">{section}</span> : null}
      </HomeLink>
      {links.length > 0 && (
        <>
          <nav className="cord-toplinks" aria-label="Liens utiles">
            {links.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <TopMenu links={links} />
        </>
      )}
    </header>
  );
}

import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";

export type HeadlineProps = {
  /** Le texte du titre. Les mots se révèlent un par un au chargement. */
  text: string;
  /** Un mot du titre à mettre en couleur, par exemple « Cord ». */
  accent?: string;
  as?: "h1" | "h2";
  className?: string;
};

/** Le grand titre signature de Cord. */
export function Headline({ text, accent, as: Tag = "h1", className }: HeadlineProps) {
  const words = text.split(" ");

  return (
    <Tag className={["cord-display", className].filter(Boolean).join(" ")}>
      {words.map((word, i) => {
        const core = word.replace(/[.,!?;:…]+$/, "");
        const tail = word.slice(core.length);
        const isAccent = accent !== undefined && core === accent;

        return (
          <Fragment key={i}>
            <span className="cord-word" style={{ "--i": i } as CSSProperties}>
              <span className="cord-word-inner">
                {isAccent ? <Accent>{core}</Accent> : core}
                {tail}
              </span>
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        );
      })}
    </Tag>
  );
}

/** Met un mot en couleur : le dégradé de la lumière, qui coule lentement. */
export function Accent({ children }: { children: ReactNode }) {
  return <span className="cord-accent">{children}</span>;
}

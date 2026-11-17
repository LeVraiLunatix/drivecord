"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, ImagePlus, Palette, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  GRADIENTS,
  RADII,
  SOLID_COLORS,
  backgroundCss,
  useAppearance,
  useBgImage,
  type Appearance,
} from "@/lib/appearance";
import { BackgroundLayer } from "@/components/drive/drive-backdrop";

/**
 * Personnaliser son drive : fond, couleur, formes, espacement. Gratuit, enregistré sur l'appareil,
 * appliqué en direct (l'aperçu et le vrai drive lisent les mêmes réglages).
 */
export function AppearanceSettings() {
  const a = useAppearance((s) => s.appearance);
  const set = useAppearance((s) => s.set);
  const reset = useAppearance((s) => s.reset);
  const image = useBgImage((s) => s.url);
  const loadImage = useBgImage((s) => s.load);
  const setFile = useBgImage((s) => s.setFile);
  const clearImage = useBgImage((s) => s.clear);
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => loadImage(), [loadImage]);

  const changed = JSON.stringify(a) !== JSON.stringify(DEFAULT_APPEARANCE) || !!image;

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      await setFile(file);
      set({ bgKind: "image" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'utiliser cette image.");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Palette className="size-4 text-muted-foreground" />
          Mon drive
          {changed && (
            <button
              type="button"
              onClick={() => { reset(); clearImage(); toast.success("Retour au style d'origine"); }}
              className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" /> Tout remettre à zéro
            </button>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Change le fond, la couleur et les formes. Tu vois le résultat tout de suite. Les réglages restent sur cet appareil.
        </p>
      </CardHeader>
      <CardContent className="space-y-9">
        <Preview a={a} image={image} />

        {/* ── Fond ─────────────────────────────────────────────────────── */}
        <Section title="Fond" hint="Le même pour tout le monde au départ : un noir uni.">
          <Seg
            value={a.bgKind}
            onChange={(v) => {
              if (v === "image" && !image) { fileRef.current?.click(); return; }
              set({ bgKind: v });
            }}
            options={[
              { value: "solid", label: "Uni" },
              { value: "gradient", label: "Dégradé" },
              { value: "image", label: "Image" },
            ]}
          />

          {a.bgKind === "solid" && (
            <div className="flex flex-wrap items-center gap-3">
              {SOLID_COLORS.map((c) => (
                <Swatch key={c.value} label={c.name} selected={a.bgColor.toLowerCase() === c.value} style={{ background: c.value }} onClick={() => set({ bgColor: c.value })} outlined />
              ))}
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm text-muted-foreground hover:text-foreground">
                <input
                  type="color"
                  value={a.bgColor}
                  onChange={(e) => set({ bgColor: e.target.value })}
                  className="size-5 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0"
                  aria-label="Choisir une couleur de fond"
                />
                Autre couleur
              </label>
            </div>
          )}

          {a.bgKind === "gradient" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {GRADIENTS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => set({ gradient: g.id })}
                  aria-pressed={a.gradient === g.id}
                  className={cn(
                    "relative h-20 overflow-hidden rounded-xl border text-left",
                    a.gradient === g.id ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-foreground/30",
                  )}
                  style={{ background: g.css }}
                >
                  <span className="absolute bottom-2 left-3 text-sm font-medium text-white drop-shadow">{g.name}</span>
                  {a.gradient === g.id && <Check className="absolute right-2 top-2 size-4 text-white" />}
                </button>
              ))}
            </div>
          )}

          {a.bgKind === "image" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-muted"
                >
                  <ImagePlus className="size-4" /> {image ? "Changer d'image" : "Choisir une image"}
                </button>
                {image && (
                  <button
                    type="button"
                    onClick={() => { clearImage(); set({ bgKind: "solid" }); }}
                    className="flex h-10 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="size-4" /> Retirer
                  </button>
                )}
              </div>
              <Slider label="Voile sombre" hint="Pour garder les textes lisibles" value={a.dim} min={0} max={0.85} step={0.05} onChange={(v) => set({ dim: v })} display={(v) => `${Math.round((v / 0.85) * 100)} %`} />
              <Slider label="Flou" value={a.blur} min={0} max={24} step={1} onChange={(v) => set({ blur: v })} display={(v) => (v === 0 ? "Aucun" : `${v} px`)} />
              <p className="text-xs text-muted-foreground">L&apos;image est réduite et gardée uniquement sur cet appareil : elle n&apos;est jamais envoyée.</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
        </Section>

        {/* ── Couleur ──────────────────────────────────────────────────── */}
        <Section title="Couleur" hint="Boutons, sélection, repères : tout suit ce choix.">
          <div className="flex flex-wrap items-center gap-3">
            {ACCENTS.map((c) => (
              <Swatch
                key={c.name}
                label={c.name}
                selected={a.hue === c.hue}
                style={{ background: c.hue == null ? "#8d78ff" : `oklch(0.68 0.17 ${c.hue})` }}
                onClick={() => set({ hue: c.hue })}
              />
            ))}
          </div>
          <Slider
            label="Teinte libre"
            value={a.hue ?? 285}
            min={0}
            max={360}
            step={1}
            onChange={(v) => set({ hue: v })}
            rainbow
          />
        </Section>

        {/* ── Formes ───────────────────────────────────────────────────── */}
        <Section title="Formes">
          <Row label="Angles">
            <Seg
              value={a.radius}
              onChange={(v) => set({ radius: v })}
              options={(Object.keys(RADII) as (keyof typeof RADII)[]).map((k) => ({ value: k, label: RADII[k].label }))}
            />
          </Row>
          <Row label="Lumière du bas" hint="La lueur KitCord derrière ton drive">
            <Seg
              value={a.light ? "on" : "off"}
              onChange={(v) => set({ light: v === "on" })}
              options={[{ value: "on", label: "Allumée" }, { value: "off", label: "Éteinte" }]}
            />
          </Row>
          <Row label="Panneaux" hint="Verre dépoli ou fond plein">
            <Seg
              value={a.glass ? "glass" : "solid"}
              onChange={(v) => set({ glass: v === "glass" })}
              options={[{ value: "glass", label: "Verre" }, { value: "solid", label: "Plein" }]}
            />
          </Row>
        </Section>

        {/* ── Disposition ──────────────────────────────────────────────── */}
        <Section title="Disposition">
          <Row label="Espacement">
            <Seg
              value={a.density}
              onChange={(v) => set({ density: v })}
              options={[{ value: "compact", label: "Serré" }, { value: "normal", label: "Normal" }, { value: "airy", label: "Aéré" }]}
            />
          </Row>
          <Row label="Taille des vignettes">
            <Seg
              value={a.thumbs}
              onChange={(v) => set({ thumbs: v })}
              options={[{ value: "s", label: "Petites" }, { value: "m", label: "Moyennes" }, { value: "l", label: "Grandes" }]}
            />
          </Row>
          <Row label="Page d'ouverture" hint="Ce que tu vois en arrivant sur ton drive">
            <Seg
              value={a.startPage}
              onChange={(v) => set({ startPage: v })}
              options={[{ value: "home", label: "Accueil" }, { value: "files", label: "Mes fichiers" }]}
            />
          </Row>
        </Section>
      </CardContent>
    </Card>
  );
}

/** Un petit drive en miniature : il prend le vrai fond, la vraie couleur et les vrais angles. */
function Preview({ a, image }: { a: Appearance; image: string | null }) {
  return (
    <div
      className="relative h-52 overflow-hidden rounded-2xl border border-border sm:h-60"
      style={{ background: backgroundCss(a) }}
      aria-label="Aperçu de ton drive"
    >
      <BackgroundLayer a={a} image={image} />
      {a.light && (
        <div
          className="absolute inset-x-0 bottom-0 h-3/4"
          style={{ background: "radial-gradient(75% 85% at 50% 115%, color-mix(in srgb, var(--cord-light-mid) 75%, transparent), color-mix(in srgb, var(--cord-light-mid) 28%, transparent) 42%, transparent 74%)" }}
        />
      )}
      <div className="relative flex h-full flex-col gap-4 p-4 sm:p-5">
        <div className="cord-glass flex h-10 items-center gap-3 rounded-[var(--cord-radius-pill)] px-4 text-xs text-[var(--cord-text)]">
          <span className="font-semibold" style={{ color: "var(--cord-light-mid)" }}>Drivecord</span>
          <span className="rounded-[var(--cord-radius-pill)] px-3 py-1 text-[var(--cord-text)]" style={{ background: "color-mix(in srgb, var(--cord-light-mid) 28%, transparent)" }}>Fichiers</span>
          <span className="hidden text-[var(--cord-dim)] sm:inline">Récents</span>
          <span className="hidden text-[var(--cord-dim)] sm:inline">Favoris</span>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-[var(--cord-text)] [font-family:var(--cord-font-display)]">Mon drive</p>
        <div className="grid flex-1 grid-cols-3 gap-3">
          {["Vacances.jpg", "Contrat.pdf", "Musique"].map((n, i) => (
            <div key={n} className="flex flex-col gap-1.5">
              <div
                className="flex-1 rounded-[var(--cord-radius-card)] border border-white/10"
                style={{ background: i === 0 ? "linear-gradient(135deg, color-mix(in srgb, var(--cord-light-mid) 70%, #000), color-mix(in srgb, var(--cord-light-warm) 60%, #000))" : "rgb(255 255 255 / 0.07)" }}
              />
              <span className="truncate text-[11px] text-[var(--cord-dim)]">{n}</span>
            </div>
          ))}
        </div>
        <div className="cord-glass absolute bottom-3 left-1/2 flex h-9 -translate-x-1/2 items-center whitespace-nowrap rounded-[var(--cord-radius-pill)] px-2 text-xs font-medium">
          <span className="rounded-[var(--cord-radius-pill)] bg-[var(--cord-light-core)] px-3 py-1 text-[var(--cord-ink)]">Envoyer<span className="hidden sm:inline"> des fichiers</span></span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Choix exclusif, en boutons côte à côte (plus clair qu'une liste déroulante). */
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" className="inline-flex max-w-full rounded-full border border-border bg-muted/40 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 whitespace-nowrap rounded-full px-4 text-sm",
            value === o.value ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatch({ label, selected, style, onClick, outlined }: { label: string; selected: boolean; style: React.CSSProperties; onClick: () => void; outlined?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex size-10 items-center justify-center rounded-full",
        outlined && "border border-border",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
      style={style}
    >
      {selected && <Check className="size-4 text-white mix-blend-difference" />}
    </button>
  );
}

function Slider({
  label, hint, value, min, max, step, onChange, display, rainbow,
}: {
  label: string; hint?: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display?: (v: number) => string; rainbow?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex justify-between text-sm">
        <span>
          {label}
          {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
        </span>
        <span className="tabular-nums text-muted-foreground">{display ? display(value) : Math.round(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full accent-[var(--primary)]"
        style={
          rainbow
            ? { background: "linear-gradient(90deg,oklch(.72 .17 0),oklch(.72 .17 60),oklch(.72 .17 120),oklch(.72 .17 180),oklch(.72 .17 240),oklch(.72 .17 300),oklch(.72 .17 360))" }
            : { background: "color-mix(in srgb, var(--foreground) 16%, transparent)" }
        }
      />
    </label>
  );
}

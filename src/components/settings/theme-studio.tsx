"use client";

import * as React from "react";
import { toast } from "sonner";
import { Crown, Lock, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TierBadge, useTier } from "@/components/patreon/tier";
import { cn } from "@/lib/utils";
import { ACCENT_PRESETS, BACKDROPS, DEFAULT_STUDIO, effectiveStudio, useStudio } from "@/lib/theme-studio";

const TIER_NAME = ["Gratuit", "Gold", "Premium", "VIP"];

/** Studio de thème Patreon : accent, fond animé, ambiance, options VIP. */
export function ThemeStudio() {
  const { tier } = useTier();
  const studio = useStudio((s) => s.studio);
  const set = useStudio((s) => s.set);
  const reset = useStudio((s) => s.reset);
  const eff = effectiveStudio(studio, tier);
  const locked = tier < 1;
  const need = (min: number) => () =>
    toast(`Réservé au palier ${TIER_NAME[min]}`, { description: "Deviens mécène Patreon pour le débloquer." });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Wand2 className="size-4 text-muted-foreground" />
          Studio de thème
          <TierBadge tier={tier} />
          {tier >= 1 && (
            <button
              onClick={() => { reset(); toast.success("Personnalisation réinitialisée"); }}
              className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-3" /> Réinitialiser
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {locked ? (
          <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-fuchsia-500/10 to-indigo-500/10 p-5">
            <Crown className="mb-2 size-6 text-amber-400" />
            <p className="font-semibold">Fais de Drivecord ton propre espace</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li><b className="text-foreground">Gold</b> · couleur d&apos;accent libre sur toute l&apos;interface + fond de poussière lumineuse</li>
              <li><b className="text-foreground">Premium</b> · constellation interactive, grille néon, intensité, vitesse, arrondi des angles</li>
              <li><b className="text-foreground">VIP</b> · rubans d&apos;aurore, étoiles filantes, dégradé à deux couleurs, halo qui suit ton curseur</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Lie ton compte Patreon plus bas pour débloquer le studio.</p>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Activer ma personnalisation</span>
              <span className="block text-xs text-muted-foreground">Désactivée, Drivecord reprend le style standard.</span>
            </span>
            <Switch checked={studio.enabled} onChange={(v) => set({ enabled: v })} />
          </label>
        )}

        <div className={cn("space-y-6", (locked || !studio.enabled) && "pointer-events-none select-none opacity-45")}>
          {/* ── Couleur ─────────────────────────────────────────────────── */}
          <Block title="Couleur d'accent" tier={1} current={tier}>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  title={p.name}
                  onClick={() => set({ hue: p.hue })}
                  className={cn(
                    "size-8 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 active:scale-90",
                    Math.round(studio.hue) === p.hue && "ring-2 ring-foreground",
                  )}
                  style={{ background: `oklch(0.72 0.17 ${p.hue})` }}
                  aria-label={p.name}
                />
              ))}
            </div>
            <Slider label="Teinte" value={studio.hue} min={0} max={360} step={1} onChange={(v) => set({ hue: v })} rainbow />
            <Slider label="Éclat" value={studio.chroma} min={0.06} max={0.22} step={0.005} onChange={(v) => set({ chroma: v })} display={(v) => `${Math.round(((v - 0.06) / 0.16) * 100)}%`} />
          </Block>

          {/* ── Fond animé ──────────────────────────────────────────────── */}
          <Block title="Fond animé du drive" tier={0} current={tier}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BACKDROPS.map((b) => {
                const ok = tier >= b.minTier;
                const on = eff.backdropStyle === b.value;
                return (
                  <button
                    key={b.value}
                    onClick={() => (ok ? set({ backdrop: b.value }) : need(b.minTier)())}
                    className={cn(
                      "relative rounded-xl border p-3 text-left transition-all active:scale-[0.97]",
                      on ? "border-primary bg-primary/10 shadow-[0_0_24px_-10px] shadow-primary" : "border-border/60 hover:border-primary/50",
                      !ok && "opacity-60",
                    )}
                  >
                    {!ok && (
                      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        <Lock className="size-2.5" /> {TIER_NAME[b.minTier]}
                      </span>
                    )}
                    <span className="block text-sm font-medium">{b.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{b.hint}</span>
                  </button>
                );
              })}
            </div>
          </Block>

          {/* ── Ambiance ────────────────────────────────────────────────── */}
          <Block title="Ambiance" tier={2} current={tier}>
            <Slider label="Intensité du fond" value={studio.intensity} min={0.3} max={1.6} step={0.05} onChange={(v) => set({ intensity: v })} display={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Vitesse d'animation" value={studio.speed} min={0.4} max={2} step={0.05} onChange={(v) => set({ speed: v })} display={(v) => `${v.toFixed(1)}×`} />
            <Slider label="Arrondi des angles" value={studio.radius} min={0.25} max={1.1} step={0.025} onChange={(v) => set({ radius: v })} display={(v) => `${Math.round(v * 16)} px`} />
          </Block>

          {/* ── VIP ─────────────────────────────────────────────────────── */}
          <Block title="Exclusif VIP" tier={3} current={tier}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Dégradé à deux couleurs</p>
                <p className="text-xs text-muted-foreground">Seconde teinte pour les fonds et les halos.</p>
              </div>
              <Switch checked={studio.hue2 != null} onChange={(v) => set({ hue2: v ? (studio.hue + 70) % 360 : null })} />
            </div>
            {studio.hue2 != null && (
              <Slider label="Seconde teinte" value={studio.hue2} min={0} max={360} step={1} onChange={(v) => set({ hue2: v })} rainbow />
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Halo qui suit le curseur</p>
                <p className="text-xs text-muted-foreground">Une lueur douce accompagne ta souris dans toute l&apos;app.</p>
              </div>
              <Switch checked={studio.cursorGlow} onChange={(v) => set({ cursorGlow: v })} />
            </div>
          </Block>
        </div>

        {!locked && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="size-3" /> Les changements s&apos;appliquent en direct. Réglages enregistrés sur cet appareil.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Block({ title, tier, current, children }: { title: string; tier: number; current: number; children: React.ReactNode }) {
  const ok = current >= tier;
  return (
    <section className={cn("space-y-3", !ok && tier > 0 && "pointer-events-none opacity-50")}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        {tier > 0 && (
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", ok ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
            {!ok && <Lock className="size-2.5" />} {TIER_NAME[tier]}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-background shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function Slider({
  label, value, min, max, step, onChange, display, rainbow,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display?: (v: number) => string; rainbow?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{display ? display(value) : Math.round(value)}</span>
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
            : { background: "var(--muted)" }
        }
      />
    </label>
  );
}

export { DEFAULT_STUDIO };

"use client";

import * as React from "react";
import { toast } from "sonner";
import { Crown, Lock, RotateCcw, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TierBadge, useTier } from "@/components/patreon/tier";
import { cn } from "@/lib/utils";
import { BACKDROPS, DEFAULT_STUDIO, effectiveStudio, useStudio } from "@/lib/theme-studio";

const TIER_NAME = ["Gratuit", "Gold", "Premium", "VIP"];

/** Bonus Patreon : un fond animé posé par-dessus le fond choisi, ses réglages, le dégradé à deux couleurs et le halo VIP. */
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
          Fonds animés
          <TierBadge tier={tier} />
          {tier >= 1 && (
            <button
              onClick={() => { reset(); toast.success("Fonds animés retirés"); }}
              className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-3" /> Réinitialiser
            </button>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">Un bonus pour les mécènes : un décor qui bouge, posé par-dessus ton fond.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {locked && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-fuchsia-500/10 to-indigo-500/10 p-5">
            <Crown className="mb-2 size-6 text-amber-400" />
            <p className="font-semibold">Donne vie à ton drive</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li><b className="text-foreground">Gold</b> · fond de poussière lumineuse</li>
              <li><b className="text-foreground">Premium</b> · constellation interactive, grille néon, intensité et vitesse réglables</li>
              <li><b className="text-foreground">VIP</b> · rubans d&apos;aurore, étoiles filantes, dégradé à deux couleurs, halo qui suit ton curseur</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Lie ton compte Patreon plus bas pour les débloquer.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => set({ backdrop: null })}
            className={cn(
              "rounded-xl border p-3 text-left",
              eff.backdropStyle === null ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50",
            )}
          >
            <span className="block text-sm font-medium">Aucun</span>
            <span className="block text-[11px] text-muted-foreground">Ton fond, sans mouvement</span>
          </button>
          {BACKDROPS.map((b) => {
            const ok = tier >= b.minTier;
            const on = eff.backdropStyle === b.value;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => (ok ? set({ backdrop: b.value }) : need(b.minTier)())}
                className={cn(
                  "relative rounded-xl border p-3 text-left",
                  on ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50",
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

        {tier >= 2 && eff.backdropStyle && (
          <Block title="Ambiance" tier={2} current={tier}>
            <Slider label="Intensité" value={studio.intensity} min={0.3} max={1.6} step={0.05} onChange={(v) => set({ intensity: v })} display={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Vitesse" value={studio.speed} min={0.4} max={2} step={0.05} onChange={(v) => set({ speed: v })} display={(v) => `${v.toFixed(1)}×`} />
          </Block>
        )}

        {tier >= 3 && (
          <Block title="Exclusif VIP" tier={3} current={tier}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Dégradé à deux couleurs</p>
                <p className="text-xs text-muted-foreground">Seconde teinte pour les fonds animés et le halo.</p>
              </div>
              <Switch checked={studio.hue2 != null} onChange={(v) => set({ hue2: v ? 330 : null })} />
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

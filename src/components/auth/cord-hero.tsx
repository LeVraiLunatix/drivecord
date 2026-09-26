"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronDown, EyeOff, Layers, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { apiUrl, IS_DESKTOP } from "@/lib/api-base";
import { oauthSignIn } from "@/lib/auth/oauth";
import { cordAuthParams, cordLoginHint } from "@/lib/auth/cord-shared";
import { isNativeApp } from "@/lib/use-platform";
import { cn } from "@/lib/utils";
import { CordLogo } from "@/components/auth/cord-account";

const EASE = [0.16, 1, 0.3, 1] as const;

const WHY = [
  { Icon: Layers, text: "Une seule identité pour toute la suite Cord" },
  { Icon: ShieldCheck, text: "2FA, passkeys et Passcord gérés par Cord" },
  { Icon: EyeOff, text: "Drivecord ne voit jamais ton mot de passe" },
] as const;

/**
 * Start the Cord flow from anywhere: web (Auth.js redirect), iOS app (Safari
 * via /native-login, then drivecord://), desktop shell (the first-party login
 * page on drivecord.app, which hands the token back to Tauri).
 */
export function startCordSignIn(callbackUrl: string, opts: { create?: boolean; email?: string | null } = {}) {
  if (IS_DESKTOP) {
    const q = new URLSearchParams({ via: "cord", callbackUrl, ...cordAuthParams(opts) });
    window.location.href = apiUrl(`/login?${q}`);
    return;
  }
  oauthSignIn("cord", callbackUrl, opts);
}

/**
 * The hero of /login and /register: Compte Cord is THE way in, for signing in
 * (silent when already signed in to Cord) as for creating an account
 * (`prompt=create`, email pre-filled when the user typed one).
 */
export function CordHero({
  mode,
  callbackUrl,
  email,
}: {
  mode: "login" | "register";
  callbackUrl: string;
  email?: string;
}) {
  const reduce = useReducedMotion();
  const [busy, setBusy] = React.useState<null | "login" | "create">(null);
  const hint = cordLoginHint(email);

  const start = (create: boolean) => {
    setBusy(create ? "create" : "login");
    startCordSignIn(callbackUrl, { create, email: hint });
    // The app stays on this page while Safari handles Cord: re-enable the buttons.
    if (isNativeApp()) window.setTimeout(() => setBusy(null), 2500);
  };

  const signInFirst = mode === "login";
  const primary = signInFirst
    ? { create: false, label: "Continuer avec Cord" }
    : { create: true, label: "Créer mon compte avec Cord" };
  const secondary = signInFirst
    ? { create: true, label: "Créer mon compte avec Cord", Icon: UserPlus }
    : { create: false, label: "J’ai déjà un Compte Cord", Icon: ArrowRight };

  return (
    <motion.section
      aria-labelledby="cord-hero-title"
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative"
    >
      {/* Soft suite-coloured glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-[#6E58F0]/30 via-[#8F4DEE]/20 to-[#B842EC]/30 blur-2xl"
      />
      {/* 1px turning halo = the card border. */}
      <div className="relative overflow-hidden rounded-2xl p-px shadow-xl shadow-[#8F4DEE]/15">
        <div aria-hidden className="cord-halo absolute -inset-[60%] opacity-80" />
        <div className="relative space-y-5 rounded-[15px] bg-card/90 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <motion.div
              initial={reduce ? false : { rotate: -12, scale: 0.7, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.15 }}
              className="relative shrink-0"
            >
              <div aria-hidden className="absolute inset-0 rounded-xl bg-[#8F4DEE]/50 blur-md" />
              <CordLogo className="relative size-11 rounded-xl ring-1 ring-white/20" />
            </motion.div>
            <div className="min-w-0">
              <h2 id="cord-hero-title" className="text-base font-semibold leading-tight">
                {signInFirst ? "Entre avec ton Compte Cord" : "Crée ton compte avec Cord"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {signInFirst
                  ? "Déjà connecté à Cord ? Tu reviens sans rien taper."
                  : "Un code à 6 chiffres par email, et tu reviens ici."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => start(primary.create)}
              disabled={busy !== null}
              className="group relative flex h-12 w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-[#6E58F0] to-[#B842EC] px-3 text-sm font-semibold text-white shadow-lg shadow-[#8F4DEE]/30 outline-none transition hover:shadow-[#8F4DEE]/50 focus-visible:ring-3 focus-visible:ring-[#B842EC]/50 active:translate-y-px disabled:opacity-80"
            >
              <span aria-hidden className="cord-sheen pointer-events-none absolute inset-0" />
              {busy === (primary.create ? "create" : "login") ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CordLogo className="size-5 rounded-[6px] ring-1 ring-white/30" />
              )}
              <span className="relative whitespace-nowrap">{primary.label}</span>
              {!primary.create && (
                <ArrowRight className="relative size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              )}
            </button>
            <button
              type="button"
              onClick={() => start(secondary.create)}
              disabled={busy !== null}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#8F4DEE]/35 bg-[#8F4DEE]/[0.07] px-4 text-sm font-medium outline-none transition hover:border-[#8F4DEE]/60 hover:bg-[#8F4DEE]/[0.12] focus-visible:ring-3 focus-visible:ring-[#B842EC]/40 active:translate-y-px disabled:opacity-70"
            >
              {busy === (secondary.create ? "create" : "login") ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <secondary.Icon className="size-4 text-[#B09AF8]" />
              )}
              {secondary.label}
            </button>
            {hint && (
              <p className="truncate text-center text-xs text-muted-foreground">
                Email prérempli : <span className="text-foreground">{hint}</span>
              </p>
            )}
          </div>

          <ul className="space-y-1.5 border-t border-border/50 pt-4">
            {WHY.map(({ Icon, text }, i) => (
              <motion.li
                key={text}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.3 + i * 0.07 }}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Icon className="size-3.5 shrink-0 text-[#A58BF7]" />
                {text}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </motion.section>
  );
}

/** Full-screen « on part chez Cord » screen (hub link, app → Safari). */
export function CordRedirecting({ create = false }: { create?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-6 overflow-hidden bg-background px-6 text-center"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#6E58F0]/30 to-[#B842EC]/30 blur-3xl"
      />
      <motion.div
        initial={reduce ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="relative flex size-24 items-center justify-center"
      >
        <svg aria-hidden viewBox="0 0 96 96" className="cord-orbit absolute inset-0 size-full">
          <defs>
            <linearGradient id="cord-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6E58F0" />
              <stop offset="1" stopColor="#B842EC" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="44" fill="none" stroke="url(#cord-ring)" strokeWidth="3" strokeLinecap="round" strokeDasharray="200 80" />
        </svg>
        <CordLogo className="size-14 rounded-2xl shadow-lg shadow-[#8F4DEE]/40 ring-1 ring-white/20" />
      </motion.div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
        className="relative space-y-1"
      >
        <p className="font-semibold">{create ? "Création de ton Compte Cord…" : "Connexion avec ton Compte Cord…"}</p>
        <p className="text-sm text-muted-foreground">Tu reviendras directement dans Drivecord.</p>
      </motion.div>
    </div>
  );
}

/** « Autres méthodes » — Discord, Google, passkey, email + mot de passe, folded under Cord. */
export function OtherMethods({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const id = React.useId();
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium outline-none transition hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span>
          Autres méthodes
          <span className="block text-xs font-normal text-muted-foreground">
            Discord, Google, passkey, email et mot de passe
          </span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="content"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

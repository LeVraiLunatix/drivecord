"use client";

import * as React from "react";
import Link from "next/link";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Variants,
} from "motion/react";
import {
  Activity,
  ArrowRight,
  CloudUpload,
  Code2,
  ExternalLink,
  Eye,
  EyeOff,
  Infinity as InfinityIcon,
  KeyRound,
  Link2,
  Lock,
  Mail,
  Rocket,
  Server,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserPlus,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CordLogo } from "@/components/auth/cord-account";
import { startCordSignIn } from "@/components/auth/cord-hero";
import { DiscordIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { STATUS_URL } from "@/lib/status-url";

const EASE = [0.16, 1, 0.3, 1] as const;
const CORD_GRADIENT = "from-[#6E58F0] via-[#8F4DEE] to-[#B842EC]";

// ── Data ────────────────────────────────────────────────────────────────────

const features = [
  { icon: Lock, title: "Chiffré de bout en bout", description: "Contenus, noms et dossiers sont chiffrés sur ton appareil. Même nous ne pouvons rien lire.", color: "from-emerald-400 to-teal-500", glow: "rgba(52,211,153,0.18)" },
  { icon: Zap, title: "Rapide, sans limite de taille", description: "Envoi en parallèle par morceaux, reprise propre, aucun plafond de fichier.", color: "from-amber-400 to-orange-500", glow: "rgba(251,191,36,0.18)" },
  { icon: Share2, title: "Partage sûr", description: "Liens chiffrés, mot de passe et expiration optionnels.", color: "from-sky-400 to-blue-500", glow: "rgba(56,189,248,0.18)" },
  { icon: CloudUpload, title: "Aperçus instantanés", description: "Images, vidéo, PDF, audio et texte, directement dans l'app.", color: "from-fuchsia-400 to-pink-500", glow: "rgba(232,121,249,0.18)" },
  { icon: Smartphone, title: "Partout avec toi", description: "Web, iPhone et Windows : mêmes fichiers, mêmes clés.", color: "from-violet-400 to-indigo-500", glow: "rgba(167,139,250,0.2)" },
  { icon: Code2, title: "Ouvert aux développeurs", description: "API, SDK et OAuth avec un dossier dédié par application.", color: "from-cyan-400 to-sky-500", glow: "rgba(34,211,238,0.18)" },
];

const steps = [
  { icon: KeyRound, title: "Connecte-toi", text: "Avec ton Compte Cord, Discord, Google ou ton e-mail. Une minute, pas de carte bancaire.", color: "from-[#6E58F0] to-[#B842EC]" },
  { icon: Server, title: "Branche ton Discord", text: "Un salon et un webhook : c'est là que vivent tes fichiers, chiffrés. On t'aide à le configurer.", color: "from-indigo-400 to-sky-500" },
  { icon: Rocket, title: "Dépose tes fichiers", text: "Glisse-dépose, retrouve, partage. Tout est chiffré avant de quitter ton appareil.", color: "from-fuchsia-400 to-orange-400" },
];

const trust = [
  { who: "Discord", sees: "Des morceaux chiffrés aux noms opaques. Rien de lisible.", icon: EyeOff, ring: "border-indigo-400/30", tint: "from-indigo-500/15", text: "text-indigo-400" },
  { who: "Drivecord", sees: "La structure de tes dossiers, sans leurs noms. Aucune clé, aucun contenu.", icon: ShieldCheck, ring: "border-fuchsia-400/30", tint: "from-fuchsia-500/15", text: "text-fuchsia-400" },
  { who: "Toi", sees: "Tout, sur chaque appareil que tu déverrouilles.", icon: Eye, ring: "border-emerald-400/40", tint: "from-emerald-500/20", text: "text-emerald-400" },
];

const fileTypes = ["Photos", "Vidéos 4K", "PDF", "Musique", "Archives ZIP", "Documents", "Code source", "Sauvegardes", "Maquettes", "Podcasts", "Scans", "Projets"];

const faq = [
  { q: "Vraiment illimité ?", a: "Tes fichiers vivent dans ton propre salon Discord via un webhook : il n'y a pas de quota Drivecord. Seules les règles de Discord s'appliquent." },
  { q: "Drivecord peut-il lire mes fichiers ?", a: "Non. Contenu, noms et dossiers sont chiffrés sur ton appareil. Le serveur ne détient aucune clé. Si tu perds ta clé de récupération, personne ne peut t'aider." },
  { q: "Que se passe-t-il si Discord change ses règles ?", a: "Le code est ouvert et tes fichiers restent à toi : exporte-les à tout moment. Garde une copie de ce qui est vital." },
  { q: "C'est gratuit ?", a: "Oui : pas d'abonnement, pas de carte bancaire. Le projet est open source et soutenu par ses mécènes." },
  { q: "Puis-je l'utiliser depuis mon propre site ?", a: "Oui, avec le SDK : un bouton d'upload et une visionneuse chiffrés, ou l'API v2 avec un jeton personnel." },
];

// ── Motion variants ─────────────────────────────────────────────────────────

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE } },
};

const reveal: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

// ── Live status ─────────────────────────────────────────────────────────────

type Level = "loading" | "ok" | "minor" | "major" | "maintenance" | "unknown";

const LEVEL: Record<Level, { label: string; dot: string; text: string }> = {
  loading: { label: "État des services", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  ok: { label: "Tous les systèmes opérationnels", dot: "bg-emerald-400", text: "text-emerald-500 dark:text-emerald-400" },
  minor: { label: "Service dégradé", dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
  major: { label: "Panne en cours", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  maintenance: { label: "Maintenance en cours", dot: "bg-sky-400", text: "text-sky-600 dark:text-sky-400" },
  unknown: { label: "État des services", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

/** The status page answers with CORS `*`, so the home can show its state live without any server code. */
function useStatusLevel(): Level {
  const [level, setLevel] = React.useState<Level>("loading");
  React.useEffect(() => {
    let cancelled = false;
    fetch(`${STATUS_URL}/api/status/summary`, { signal: AbortSignal.timeout(6000) })
      .then((r) => r.json() as Promise<{ status?: { indicator?: string } }>)
      .then((j) => {
        if (cancelled) return;
        const i = j.status?.indicator;
        setLevel(i === "none" ? "ok" : i === "minor" ? "minor" : i === "major" || i === "critical" ? "major" : i === "maintenance" ? "maintenance" : "unknown");
      })
      .catch(() => !cancelled && setLevel("unknown"));
    return () => {
      cancelled = true;
    };
  }, []);
  return level;
}

function StatusLink({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const level = useStatusLevel();
  const reduce = useReducedMotion();
  const l = LEVEL[level];
  return (
    <a
      href={STATUS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium backdrop-blur transition hover:border-foreground/30 hover:bg-background/90 ${className}`}
    >
      <span className="relative flex size-2">
        {level !== "loading" && !reduce && <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${l.dot}`} />}
        <span className={`relative inline-flex size-2 rounded-full ${l.dot}`} />
      </span>
      <span className={level === "ok" || level === "minor" || level === "major" || level === "maintenance" ? l.text : "text-foreground"}>
        {compact ? "Statut" : l.label}
      </span>
      {!compact && <ArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
    </a>
  );
}

// ── Sign-in / sign-up ───────────────────────────────────────────────────────

const CALLBACK = "/drive";

/**
 * The way in: Compte Cord first (sign in or create an account in one click), then the other methods
 * (they all live on /login and /register, where the existing flows handle them).
 */
function AuthCard({ id, compact = false }: { id?: string; compact?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative w-full max-w-md">
      <div aria-hidden className={`pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br ${CORD_GRADIENT} opacity-25 blur-2xl`} />
      <div className="relative overflow-hidden rounded-2xl p-px shadow-xl shadow-[#8F4DEE]/20">
        <div aria-hidden className="cord-halo absolute -inset-[60%] opacity-80" />
        <div className="relative space-y-4 rounded-[15px] bg-card/90 p-5 text-left backdrop-blur-xl">
          {!compact && (
            <div className="flex items-center gap-3">
              <motion.div
                initial={reduce ? false : { rotate: -12, scale: 0.7, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.3 }}
                className="relative shrink-0"
              >
                <div aria-hidden className="absolute inset-0 rounded-xl bg-[#8F4DEE]/50 blur-md" />
                <CordLogo className="relative size-11 rounded-xl ring-1 ring-white/20" />
              </motion.div>
              <div className="min-w-0">
                <h2 id={id} className="text-base font-semibold leading-tight">Entre dans Drivecord</h2>
                <p className="text-xs text-muted-foreground">Avec ton Compte Cord, en un clic.</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => startCordSignIn(CALLBACK)}
              className="group relative flex h-12 w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-[#6E58F0] to-[#B842EC] px-3 text-sm font-semibold text-white shadow-lg shadow-[#8F4DEE]/30 outline-none transition hover:shadow-[#8F4DEE]/50 focus-visible:ring-3 focus-visible:ring-[#B842EC]/50 active:translate-y-px"
            >
              <span aria-hidden className="cord-sheen pointer-events-none absolute inset-0" />
              <CordLogo className="size-5 rounded-[6px] ring-1 ring-white/30" />
              <span className="relative whitespace-nowrap">Se connecter avec Cord</span>
              <ArrowRight className="relative size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </button>
            <button
              type="button"
              onClick={() => startCordSignIn(CALLBACK, { create: true })}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#8F4DEE]/35 bg-[#8F4DEE]/[0.07] px-4 text-sm font-medium outline-none transition hover:border-[#8F4DEE]/60 hover:bg-[#8F4DEE]/[0.12] focus-visible:ring-3 focus-visible:ring-[#B842EC]/40 active:translate-y-px"
            >
              <UserPlus className="size-4 text-[#B09AF8]" />
              S&apos;inscrire avec Cord
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground/70">
            <span className="h-px flex-1 bg-border/60" />
            ou autrement
            <span className="h-px flex-1 bg-border/60" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button asChild variant="outline" size="sm" className="h-10 gap-1.5 text-xs">
              <Link href="/login"><DiscordIcon />Discord</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-10 gap-1.5 text-xs">
              <Link href="/login"><GoogleIcon />Google</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-10 gap-1.5 text-xs">
              <Link href="/login"><Mail className="size-4 text-sky-400" />E-mail</Link>
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">S&apos;inscrire avec une autre méthode</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Decoration ──────────────────────────────────────────────────────────────

/** Slow drifting colour blobs behind the whole page. */
function Aurora() {
  const reduce = useReducedMotion();
  const blobs = [
    { c: "bg-violet-500", pos: "left-[-10%] top-[-8%] size-[34rem]", x: [0, 80, -40, 0], y: [0, 50, 90, 0], d: 26 },
    { c: "bg-fuchsia-500", pos: "right-[-12%] top-[10%] size-[30rem]", x: [0, -90, 30, 0], y: [0, 70, -30, 0], d: 32 },
    { c: "bg-sky-500", pos: "left-[25%] top-[45%] size-[28rem]", x: [0, 60, -60, 0], y: [0, -50, 40, 0], d: 38 },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full opacity-[0.16] blur-[110px] dark:opacity-[0.22] ${b.c} ${b.pos}`}
          animate={reduce ? undefined : { x: b.x, y: b.y }}
          transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: "linear-gradient(to right, rgba(128,128,128,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.09) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, #000 30%, transparent 80%)",
        }}
      />
    </div>
  );
}

function GradientText({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="bg-gradient-to-r from-[#6E58F0] via-[#B842EC] to-[#38bdf8] bg-[length:200%_auto] bg-clip-text text-transparent"
      animate={reduce ? undefined : { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.span>
  );
}

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [v, setV] = React.useState(reduce ? to : 0);
  React.useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [inView, to, reduce]);
  return <span ref={ref}>{v}{suffix}</span>;
}

/** A card whose background follows the pointer with a soft coloured spotlight. */
function SpotCard({ glow, children, className = "" }: { glow: string; children: React.ReactNode; className?: string }) {
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      onPointerMove={onMove}
      className={`group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-xl ${className}`}
      style={{ ["--glow" as string]: glow }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), var(--glow), transparent 70%)" }} />
      <div className="relative">{children}</div>
    </div>
  );
}

// ── Product mock ────────────────────────────────────────────────────────────

const files = [
  { n: "vacances-2026.jpg", m: "4,2 Mo", c: "from-pink-400/70 to-orange-300/60", e: "JPG" },
  { n: "contrat.pdf", m: "820 Ko", c: "from-red-400/70 to-rose-300/60", e: "PDF" },
  { n: "maquette.fig", m: "12 Mo", c: "from-violet-400/70 to-fuchsia-300/60", e: "FIG" },
  { n: "demo.mp4", m: "148 Mo", c: "from-sky-400/70 to-cyan-300/60", e: "MP4" },
  { n: "notes.md", m: "6 Ko", c: "from-emerald-400/70 to-teal-300/60", e: "MD" },
  { n: "budget.xlsx", m: "96 Ko", c: "from-lime-400/70 to-green-300/60", e: "XLS" },
];

function FolderMock() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  );
}

function FloatingChip({ className, delay = 0, children }: { className: string; delay?: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`absolute z-10 hidden items-center gap-2 rounded-xl border border-border/60 bg-card/90 px-3 py-2 text-xs font-medium shadow-xl backdrop-blur-xl md:flex ${className}`}
      initial={reduce ? false : { opacity: 0, scale: 0.8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: [0, -8, 0] }}
      transition={reduce ? undefined : { opacity: { delay: 0.9 + delay, duration: 0.5 }, scale: { delay: 0.9 + delay, type: "spring", stiffness: 200, damping: 14 }, y: { delay: 1 + delay, duration: 5, repeat: Infinity, ease: "easeInOut" } }}
    >
      {children}
    </motion.div>
  );
}

/** Pure-CSS replica of the drive that tilts toward the pointer: shows the product without a screenshot that goes stale. */
function ProductMock() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-8, 8]), { stiffness: 120, damping: 18 });
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => {
    px.set(0);
    py.set(0);
  };
  return (
    <div className="relative mx-auto mt-16 w-full max-w-5xl [perspective:1400px]" onPointerMove={onMove} onPointerLeave={reset}>
      <div aria-hidden className="absolute inset-x-6 -bottom-10 h-48 rounded-full bg-gradient-to-r from-violet-500/30 via-fuchsia-500/25 to-sky-500/25 blur-3xl" />

      <FloatingChip className="-left-4 top-10 lg:-left-10">
        <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400"><Lock className="size-4" /></span>
        <span>Chiffré de bout en bout</span>
      </FloatingChip>
      <FloatingChip className="-right-4 top-24 lg:-right-10" delay={0.3}>
        <span className="flex size-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400"><InfinityIcon className="size-4" /></span>
        <span>Stockage illimité</span>
      </FloatingChip>
      <FloatingChip className="-bottom-5 left-12 lg:left-20" delay={0.6}>
        <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400"><CloudUpload className="size-4" /></span>
        <span className="flex flex-col gap-1">
          <span>demo.mp4 · envoi…</span>
          <span className="h-1 w-28 overflow-hidden rounded-full bg-muted">
            <motion.span
              className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500"
              animate={reduce ? { width: "100%" } : { width: ["0%", "100%", "100%"] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", times: [0, 0.8, 1] }}
            />
          </span>
        </span>
      </FloatingChip>

      <motion.div style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl shadow-violet-950/30 backdrop-blur-xl">
        <div className="flex items-center gap-1.5 border-b border-border/50 bg-background/60 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-red-400/80" /><span className="size-2.5 rounded-full bg-amber-400/80" /><span className="size-2.5 rounded-full bg-emerald-400/80" />
          <span className="mx-auto flex items-center gap-1.5 rounded-md bg-muted/60 px-3 py-0.5 font-mono text-[11px] text-muted-foreground"><Lock className="size-3 text-emerald-400" />drivecord.app/drive</span>
        </div>
        <div className="grid grid-cols-[170px_1fr] text-left">
          <aside className="hidden space-y-1 border-r border-border/50 bg-background/40 p-3 text-xs sm:block">
            <div className="mb-3 flex items-center gap-2 font-semibold"><span className={`flex size-6 items-center justify-center rounded-md bg-gradient-to-br ${CORD_GRADIENT}`}><CloudUpload className="size-3.5 text-white" /></span>drivecord</div>
            {[
              ["Tous les fichiers", "bg-violet-500"],
              ["Favoris", "bg-amber-400"],
              ["Coffre-fort", "bg-emerald-400"],
              ["Liens partagés", "bg-sky-400"],
              ["Corbeille", "bg-rose-400"],
            ].map(([l, dot], i) => (
              <div key={l} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${i === 0 ? "bg-violet-500/15 font-medium text-foreground" : "text-muted-foreground"}`}>
                <span className={`size-1.5 rounded-full ${dot}`} />{l}
              </div>
            ))}
            <div className="mt-6 rounded-xl border border-border/50 bg-card/60 p-2.5">
              <p className="text-[10px] text-muted-foreground">Espace utilisé</p>
              <p className="text-sm font-semibold">2,4 Go · Illimité</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" /></div>
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="size-2.5 text-emerald-400" />Chiffré de bout en bout</p>
            </div>
          </aside>
          <div className="col-span-2 space-y-3 p-4 sm:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">Rechercher dans ce drive…</div>
              <div className={`rounded-lg bg-gradient-to-r ${CORD_GRADIENT} px-3 py-1.5 text-xs font-medium text-white`}>Upload</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {[
                ["Projets", "bg-amber-500/15 text-amber-400"],
                ["Photos", "bg-pink-500/15 text-pink-400"],
                ["Documents", "bg-sky-500/15 text-sky-400"],
              ].map(([f, tone]) => (
                <div key={f} className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card/60 p-2.5">
                  <span className={`flex size-9 items-center justify-center rounded-xl ${tone}`}><FolderMock /></span>
                  <div><p className="text-xs font-semibold">{f}</p><p className="text-[10px] text-muted-foreground">12 éléments</p></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {files.map((f, i) => (
                <motion.div
                  key={f.n}
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + i * 0.08, duration: 0.5, ease: EASE }}
                  className="overflow-hidden rounded-2xl border border-border/50 bg-card/60"
                >
                  <div className={`flex h-16 items-end bg-gradient-to-br ${f.c} p-1.5`}><span className="rounded bg-background/70 px-1 font-mono text-[9px] text-muted-foreground">{f.e}</span></div>
                  <div className="p-1.5"><p className="truncate text-[11px] font-medium">{f.n}</p><p className="text-[10px] text-muted-foreground">{f.m}</p></div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Marquee() {
  const reduce = useReducedMotion();
  const row = [...fileTypes, ...fileTypes];
  return (
    <div aria-hidden className="relative overflow-hidden py-3 [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
      <motion.div
        className="flex w-max gap-3"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
      >
        {row.map((t, i) => (
          <span key={`${t}-${i}`} className="flex items-center gap-2 rounded-full border border-border/50 bg-card/40 px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-3.5 text-violet-400" />{t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function SectionHeading({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-violet-500 dark:text-violet-300">{kicker}</p>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function Landing() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <Aurora />

      {/* ── Nav ── */}
      <motion.header
        initial={{ y: -64, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="sticky top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-mono text-base font-semibold tracking-tight">
            <span className={`flex size-7 items-center justify-center rounded-lg bg-gradient-to-br ${CORD_GRADIENT} shadow-md shadow-violet-500/30`}>
              <CloudUpload className="size-4 text-white" />
            </span>
            drivecord
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/docs">Docs</Link>
            </Button>
            <StatusLink compact className="hidden sm:inline-flex" />
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => startCordSignIn(CALLBACK)}>
              Se connecter
            </Button>
            <button
              type="button"
              onClick={() => startCordSignIn(CALLBACK, { create: true })}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r ${CORD_GRADIENT} px-3 text-sm font-medium text-white shadow-md shadow-violet-500/25 outline-none transition hover:brightness-110 focus-visible:ring-3 focus-visible:ring-[#B842EC]/50 active:translate-y-px`}
            >
              S&apos;inscrire
              <ArrowRight className="size-3.5" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </motion.header>

      <main className="flex flex-1 flex-col">
        {/* ── Hero ── */}
        <section className="relative flex flex-col items-center justify-center px-5 pb-20 pt-14 text-center sm:pt-24">
          <motion.div variants={v ?? container} initial="hidden" animate="show" className="flex flex-col items-center gap-6">
            <motion.h1 variants={v ?? item} className="max-w-4xl text-balance text-[2.6rem] font-bold leading-[1.05] tracking-tight sm:text-7xl">
              Ton cloud <GradientText>illimité</GradientText>,<br className="hidden sm:block" /> propulsé par Discord.
            </motion.h1>

            <motion.p variants={v ?? item} className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Tes fichiers, <strong className="font-semibold text-foreground">chiffrés sur ton appareil</strong> et stockés sur ton propre Discord. Sans abonnement, sans limite de taille.
            </motion.p>

            <motion.div variants={v ?? item} className="flex w-full justify-center">
              <AuthCard id="hero-auth" />
            </motion.div>

            <motion.p variants={v ?? item} className="text-sm text-muted-foreground">
              Gratuit, open source · aussi sur{" "}
              <Link href="/download/windows" className="font-medium text-foreground underline-offset-4 hover:underline">Windows</Link>
              {" "}et{" "}
              <Link href="/install" className="font-medium text-foreground underline-offset-4 hover:underline">iPhone</Link>
            </motion.p>
          </motion.div>

          <motion.div variants={v ?? reveal} initial="hidden" animate="show" className="w-full">
            <ProductMock />
          </motion.div>
        </section>

        <Marquee />

        {/* ── Stats ── */}
        <section className="px-5 py-14 sm:px-6">
          <motion.dl
            variants={v ?? container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {[
              { k: "Stockage", v: <InfinityIcon className="mx-auto size-9" strokeWidth={2.5} />, c: "from-violet-400 to-fuchsia-500" },
              { k: "bits · AES-GCM", v: <Counter to={256} />, c: "from-emerald-400 to-teal-500" },
              { k: "% open source", v: <Counter to={100} />, c: "from-sky-400 to-indigo-500" },
              { k: "€ d'abonnement", v: <Counter to={0} />, c: "from-amber-400 to-orange-500" },
            ].map((s) => (
              <motion.div key={s.k} variants={v ?? item} className="rounded-2xl border border-border/50 bg-card/40 px-4 py-5 text-center backdrop-blur">
                <dd className={`bg-gradient-to-br ${s.c} bg-clip-text text-4xl font-bold tabular-nums text-transparent`}>{s.v}</dd>
                <dt className="mt-1 text-xs text-muted-foreground">{s.k}</dt>
              </motion.div>
            ))}
          </motion.dl>
        </section>

        {/* ── Features ── */}
        <section className="px-5 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <SectionHeading kicker="Fonctionnalités" title="Tout ce dont tu as besoin" sub="Un vrai drive, avec la confidentialité en plus." />
            <motion.div variants={v ?? container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, description, color, glow }) => (
                <motion.div key={title} variants={v ?? item}>
                  <SpotCard glow={glow} className="h-full">
                    <div className={`mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-white shadow-lg transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110`}>
                      <Icon className="size-5" />
                    </div>
                    <h3 className="mb-1.5 font-semibold">{title}</h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </SpotCard>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="px-5 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <SectionHeading kicker="Comment ça marche" title="Prêt en trois étapes" />
            <motion.ol variants={v ?? container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="relative grid gap-6 md:grid-cols-3">
              <motion.div
                aria-hidden
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}
                className="absolute left-[16%] right-[16%] top-8 hidden h-px origin-left bg-gradient-to-r from-violet-400/60 via-fuchsia-400/60 to-orange-400/60 md:block"
              />
              {steps.map(({ icon: Icon, title, text, color }, i) => (
                <motion.li key={title} variants={v ?? item} className="relative text-center">
                  <div className={`relative mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-white shadow-xl shadow-violet-500/20`}>
                    <Icon className="size-7" />
                    <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-border bg-background font-mono text-xs font-semibold text-foreground">{i + 1}</span>
                  </div>
                  <h3 className="mb-1.5 font-semibold">{title}</h3>
                  <p className="mx-auto max-w-xs text-sm text-muted-foreground">{text}</p>
                </motion.li>
              ))}
            </motion.ol>
          </div>
        </section>

        {/* ── Trust ── */}
        <section className="px-5 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <SectionHeading kicker="Confidentialité" title="Qui voit quoi ?" />
            <motion.div variants={v ?? container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-4 sm:grid-cols-3">
              {trust.map((t) => (
                <motion.div key={t.who} variants={v ?? item} className={`rounded-2xl border bg-gradient-to-b ${t.tint} to-transparent p-6 backdrop-blur transition-transform duration-300 hover:-translate-y-1 ${t.ring}`}>
                  <t.icon className={`mb-3 size-6 ${t.text}`} />
                  <h3 className={`mb-2 font-semibold ${t.text}`}>{t.who}</h3>
                  <p className="text-sm text-muted-foreground">{t.sees}</p>
                </motion.div>
              ))}
            </motion.div>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Code ouvert, primitives standard (AES-256-GCM, Argon2id), modèle de menace publié —{" "}
              <Link href="/docs/securite/chiffrement" className="text-violet-500 hover:underline dark:text-violet-300">voir comment ça marche</Link>.
            </p>
          </div>
        </section>

        {/* ── Developers ── */}
        <section className="border-y border-border/40 bg-card/20 px-5 py-20 backdrop-blur sm:px-6">
          <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2">
            <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-cyan-500 dark:text-cyan-300">Développeurs</p>
              <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">Intègre Drivecord dans ton site</h2>
              <p className="mb-5 text-sm text-muted-foreground">
                Un bouton d&apos;upload et une visionneuse chiffrés de bout en bout en quelques lignes. Ton site ne voit jamais ni les clés, ni les noms.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="gap-2">
                  <Link href="/docs/technique/sdk">Voir le SDK <ArrowRight className="size-4" /></Link>
                </Button>
                <Button asChild variant="ghost" className="gap-2">
                  <Link href="/docs/technique/api-v2"><Link2 className="size-4" />API v2</Link>
                </Button>
              </div>
            </motion.div>
            <motion.pre variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="overflow-x-auto rounded-2xl border border-border/50 bg-background/80 p-5 text-xs leading-relaxed shadow-xl shadow-violet-950/10"><code>
              <span className="text-violet-400">const</span> dc = <span className="text-sky-400">Drivecord</span>.<span className="text-amber-300">init</span>({"{"} clientId, redirectUri {"}"});{"\n"}
              <span className="text-violet-400">await</span> dc.<span className="text-amber-300">signIn</span>();{"\n\n"}
              dc.<span className="text-amber-300">mountUploader</span>(el, {"{"}{"\n"}
              {"  "}onUploaded: ({"{"} fileId {"}"}) =&gt; <span className="text-amber-300">save</span>(fileId),{"\n"}
              {"}"});
            </code></motion.pre>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <SectionHeading kicker="Questions" title="Tu te demandes…" />
            <div className="divide-y divide-border/50 overflow-hidden rounded-3xl border border-border/50 bg-card/30 backdrop-blur">
              {faq.map((f) => (
                <details key={f.q} className="group px-6 py-4 transition-colors open:bg-violet-500/[0.04] [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-lg leading-none text-violet-500 transition-transform group-open:rotate-45 dark:text-violet-300">+</span>
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="px-5 pb-24 pt-4 sm:px-6">
          <motion.div
            variants={v ?? reveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="relative mx-auto flex max-w-3xl flex-col items-center overflow-hidden rounded-3xl border border-violet-400/30 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-sky-500/10 px-6 py-14 text-center backdrop-blur"
          >
            <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <h2 className="relative mb-3 text-3xl font-bold tracking-tight sm:text-4xl">Commence maintenant</h2>
            <p className="relative mb-8 max-w-md text-muted-foreground">Un webhook Discord suffit. Aucune carte bancaire, aucune installation.</p>
            <div className="relative flex w-full justify-center">
              <AuthCard compact />
            </div>
            <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
              <StatusLink />
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <Link href="https://github.com/LeVraiLunatix/drivecord" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Code source
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 bg-background/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/docs" className="hover:text-foreground">Documentation</Link>
            <Link href="/conditions" className="hover:text-foreground">Conditions &amp; mentions légales</Link>
            <a href={STATUS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              <Activity className="size-3" />Statut
            </a>
            <Link href="https://github.com/LeVraiLunatix/drivecord" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              Code source
            </Link>
          </nav>
          <p>
            <Link href="/" className="font-mono hover:text-foreground">drivecord</Link> · open source
          </p>
        </div>
      </footer>
    </div>
  );
}

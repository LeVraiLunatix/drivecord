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
import { Accent, Glow, Headline, TopMenu } from "@/kitcord";
import { CordLogo } from "@/components/auth/cord-account";
import { startCordSignIn } from "@/components/auth/cord-hero";
import { DiscordIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { STATUS_URL } from "@/lib/status-url";

const EASE = [0.16, 1, 0.3, 1] as const;
const CORD_GRADIENT = "from-[#6E58F0] via-[#8F4DEE] to-[#B842EC]";

/** Pastille d'icône : la teinte de la lumière du kit, sur verre. */
const ICON_TILE =
  "flex items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--cord-light-mid)_18%,transparent)] text-[var(--cord-light-core)] shadow-[inset_0_1px_0_rgb(255_255_255/0.22),inset_0_0_0_1px_rgb(255_255_255/0.08)]";

// ── Data ────────────────────────────────────────────────────────────────────

const features = [
  { icon: Lock, title: "Chiffré de bout en bout", description: "Contenus, noms et dossiers sont chiffrés sur ton appareil. Même nous ne pouvons rien lire." },
  { icon: Zap, title: "Rapide, sans limite de taille", description: "Envoi en parallèle par morceaux, reprise propre, aucun plafond de fichier." },
  { icon: Share2, title: "Partage sûr", description: "Liens chiffrés, mot de passe et expiration optionnels." },
  { icon: CloudUpload, title: "Aperçus instantanés", description: "Images, vidéo, PDF, audio et texte, directement dans l'app." },
  { icon: Smartphone, title: "Partout avec toi", description: "Web, iPhone et Windows : mêmes fichiers, mêmes clés." },
  { icon: Code2, title: "Ouvert aux développeurs", description: "API, SDK et OAuth avec un dossier dédié par application." },
];

const steps = [
  { icon: KeyRound, title: "Connecte-toi", text: "Avec ton Compte Cord, Discord, Google ou ton e-mail. Une minute, pas de carte bancaire." },
  { icon: Server, title: "Branche ton Discord", text: "Un salon et un webhook : c'est là que vivent tes fichiers, chiffrés. On t'aide à le configurer." },
  { icon: Rocket, title: "Dépose tes fichiers", text: "Glisse-dépose, retrouve, partage. Tout est chiffré avant de quitter ton appareil." },
];

const trust = [
  { who: "Discord", sees: "Des morceaux chiffrés aux noms opaques. Rien de lisible.", icon: EyeOff, text: "text-[var(--cord-dim)]" },
  { who: "Drivecord", sees: "La structure de tes dossiers, sans leurs noms. Aucune clé, aucun contenu.", icon: ShieldCheck, text: "text-[var(--cord-light-mid)]" },
  { who: "Toi", sees: "Tout, sur chaque appareil que tu déverrouilles.", icon: Eye, text: "text-[var(--cord-light-warm)]" },
];

const fileTypes = ["Photos", "Vidéos 4K", "PDF", "Musique", "Archives ZIP", "Documents", "Code source", "Sauvegardes", "Maquettes", "Podcasts", "Scans", "Projets"];

const faq = [
  { q: "Vraiment illimité ?", a: "Tes fichiers vivent dans ton propre salon Discord via un webhook : il n'y a pas de quota Drivecord. Seules les règles de Discord s'appliquent." },
  { q: "Drivecord peut-il lire mes fichiers ?", a: "Non. Contenu, noms et dossiers sont chiffrés sur ton appareil. Le serveur ne détient aucune clé. Si tu perds ta clé de récupération, personne ne peut t'aider." },
  { q: "Que se passe-t-il si Discord change ses règles ?", a: "Le code est ouvert et tes fichiers restent à toi : exporte-les à tout moment. Garde une copie de ce qui est vital." },
  { q: "C'est gratuit ?", a: "Oui : pas d'abonnement, pas de carte bancaire. Le projet est open source et soutenu par ses mécènes." },
  { q: "Puis-je l'utiliser depuis mon propre site ?", a: "Oui, avec le SDK : un bouton d'upload et une visionneuse chiffrés, ou l'API v2 avec un jeton personnel." },
];

/** Le menu des petits écrans (feuille de liens du kit). */
const menuLinks = [
  { label: "Documentation", href: "/docs" },
  { label: "Statut des services", href: STATUS_URL },
  { label: "Drivecord pour Windows", href: "/download/windows" },
  { label: "Drivecord sur iPhone", href: "/install" },
  { label: "Code source", href: "https://github.com/LeVraiLunatix/drivecord" },
];

// ── Motion variants ─────────────────────────────────────────────────────────

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const reveal: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

// ── Live status ─────────────────────────────────────────────────────────────

type Level = "loading" | "ok" | "minor" | "major" | "maintenance" | "unknown";

const LEVEL: Record<Level, { label: string; dot: string; text: string }> = {
  loading: { label: "État des services", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  ok: { label: "Tous les systèmes opérationnels", dot: "bg-emerald-400", text: "text-emerald-400" },
  minor: { label: "Service dégradé", dot: "bg-amber-400", text: "text-amber-400" },
  major: { label: "Panne en cours", dot: "bg-red-500", text: "text-red-400" },
  maintenance: { label: "Maintenance en cours", dot: "bg-sky-400", text: "text-sky-400" },
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

function StatusDot({ level }: { level: Level }) {
  const reduce = useReducedMotion();
  const l = LEVEL[level];
  return (
    <span className="relative flex size-2">
      {level !== "loading" && !reduce && <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${l.dot}`} />}
      <span className={`relative inline-flex size-2 rounded-full ${l.dot}`} />
    </span>
  );
}

/** `compact` : un lien texte pour la barre du haut ; sinon une pastille de verre. */
function StatusLink({ compact = false }: { compact?: boolean }) {
  const level = useStatusLevel();
  const l = LEVEL[level];
  const known = level === "ok" || level === "minor" || level === "major" || level === "maintenance";
  if (compact) {
    return (
      <a href={STATUS_URL} target="_blank" rel="noopener noreferrer" className="gap-2">
        <StatusDot level={level} />
        Statut
      </a>
    );
  }
  return (
    <a
      href={STATUS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="cord-button group h-11 gap-2 px-4 text-sm font-medium"
    >
      <StatusDot level={level} />
      <span className={known ? l.text : "text-foreground"}>{l.label}</span>
      <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
    <div className="cord-glass relative w-full max-w-md space-y-4 rounded-[22px] p-5 text-left sm:p-6">
      {!compact && (
        <div className="flex items-center gap-3">
          <motion.div
            initial={reduce ? false : { rotate: -12, scale: 0.7, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.9 }}
            className="shrink-0"
          >
            <CordLogo className="size-11 rounded-xl ring-1 ring-white/20" />
          </motion.div>
          <div className="min-w-0">
            <h2 id={id} className="font-display text-lg font-semibold leading-tight tracking-tight">Entre dans Drivecord</h2>
            <p className="text-sm text-muted-foreground">Avec ton Compte Cord, en un clic.</p>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <button
          type="button"
          data-primary
          onClick={() => startCordSignIn(CALLBACK)}
          className="cord-button group h-12 w-full gap-2.5 px-4 text-[15px]"
        >
          <CordLogo className="size-5 rounded-[6px]" />
          <span className="whitespace-nowrap">Se connecter avec Cord</span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </button>
        <button
          type="button"
          onClick={() => startCordSignIn(CALLBACK, { create: true })}
          className="cord-button h-12 w-full gap-2 px-4 text-[15px]"
        >
          <UserPlus className="size-4 text-[var(--cord-light-mid)]" />
          S&apos;inscrire avec Cord
        </button>
      </div>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou autrement
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Link href="/login" className="cord-button h-11 gap-1.5 px-2 text-sm">
          <DiscordIcon />Discord
        </Link>
        <Link href="/login" className="cord-button h-11 gap-1.5 px-2 text-sm">
          <GoogleIcon />Google
        </Link>
        <Link href="/login" className="cord-button h-11 gap-1.5 px-2 text-sm">
          <Mail className="size-4 text-sky-400" />E-mail
        </Link>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link href="/register" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
          S&apos;inscrire autrement
        </Link>
      </p>
    </div>
  );
}

// ── Decoration ──────────────────────────────────────────────────────────────

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

/** Une carte de verre léger dont le reflet suit le pointeur. */
function SpotCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      onPointerMove={onMove}
      data-soft
      className={`cord-glass group relative overflow-hidden rounded-[var(--cord-radius-card)] p-6 transition-transform duration-300 hover:-translate-y-1 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--cord-light-mid) 20%, transparent), transparent 70%)" }}
      />
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
      className={`absolute z-10 hidden items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 text-xs font-medium shadow-xl backdrop-blur-xl md:flex ${className}`}
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
    <div className="relative mx-auto w-full max-w-5xl [perspective:1400px]" onPointerMove={onMove} onPointerLeave={reset}>
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

      <motion.div style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} className="relative overflow-hidden rounded-[var(--cord-radius-panel)] border border-border bg-card/85 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-1.5 border-b border-border bg-background/60 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-red-400/80" /><span className="size-2.5 rounded-full bg-amber-400/80" /><span className="size-2.5 rounded-full bg-emerald-400/80" />
          <span className="mx-auto flex items-center gap-1.5 rounded-md bg-muted/60 px-3 py-0.5 font-mono text-[11px] text-muted-foreground"><Lock className="size-3 text-emerald-400" />drivecord.app/drive</span>
        </div>
        <div className="grid grid-cols-[170px_1fr] text-left">
          <aside className="hidden space-y-1 border-r border-border bg-background/40 p-3 text-xs sm:block">
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
            <div className="mt-6 rounded-xl border border-border bg-card/60 p-2.5">
              <p className="text-[10px] text-muted-foreground">Espace utilisé</p>
              <p className="text-sm font-semibold">2,4 Go · Illimité</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" /></div>
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="size-2.5 text-emerald-400" />Chiffré de bout en bout</p>
            </div>
          </aside>
          <div className="col-span-2 min-w-0 space-y-3 p-4 sm:col-span-1">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-xl bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">Rechercher dans ce drive…</div>
              <div className="rounded-full bg-[var(--cord-light-core)] px-3 py-1.5 text-xs font-medium text-[var(--cord-ink)]">Upload</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {[
                ["Projets", "bg-amber-500/15 text-amber-400"],
                ["Photos", "bg-pink-500/15 text-pink-400"],
                ["Documents", "bg-sky-500/15 text-sky-400"],
              ].map(([f, tone]) => (
                <div key={f} className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-border bg-card/60 p-2.5">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><FolderMock /></span>
                  <div className="min-w-0"><p className="truncate text-xs font-semibold">{f}</p><p className="text-[10px] text-muted-foreground">12 éléments</p></div>
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
                  className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card/60"
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
          <span key={`${t}-${i}`} className="flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-3.5 text-[var(--cord-light-mid)]" />{t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function SectionHeading({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-[var(--cord-light-mid)]">{kicker}</p>
      <h2 className="font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1] tracking-[-0.04em] text-balance">{title}</h2>
      {sub && <p className="cord-lede mt-4">{sub}</p>}
    </motion.div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

/**
 * L'accueil public, au design KitCord : barre flottante, grand titre centré sur la
 * lumière du bas, verre léger. Il reste sombre quel que soit le thème choisi
 * (la classe `dark` locale applique la palette du kit), comme le reste de la suite.
 */
export function Landing() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;

  return (
    <div className="dark relative flex min-h-[100dvh] flex-col bg-background text-foreground [color-scheme:dark]">
      <Glow />

      {/* ── Barre du haut ── */}
      <header className="cord-topbar">
        <Link href="/" className="cord-wordmark inline-flex min-h-11 items-center" aria-label="Drivecord, accueil">
          <span>Drive<Accent>cord</Accent></span>
        </Link>
        <div className="flex items-center gap-2">
          <nav className="cord-toplinks items-center" aria-label="Liens utiles">
            <Link href="/docs">Docs</Link>
            <StatusLink compact />
            <button
              type="button"
              onClick={() => startCordSignIn(CALLBACK)}
              className="min-h-10 cursor-pointer px-1 hover:text-foreground"
            >
              Se connecter
            </button>
          </nav>
          <button
            type="button"
            data-primary
            onClick={() => startCordSignIn(CALLBACK, { create: true })}
            className="cord-button h-11 gap-1.5 px-5 text-[15px] max-[700px]:hidden"
          >
            S&apos;inscrire
            <ArrowRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => startCordSignIn(CALLBACK)}
            className="cord-button h-11 px-4 text-[15px] min-[701px]:hidden"
          >
            Se connecter
          </button>
          <TopMenu links={menuLinks} />
        </div>
      </header>

      <div className="relative z-[1] flex flex-1 flex-col">
        <main className="flex flex-1 flex-col">
          {/* ── Hero ── */}
          <section className="flex flex-col items-center px-[var(--cord-space-gutter)] pb-20 pt-14 text-center sm:pt-24">
            <Headline text="Ton cloud illimité, propulsé par Discord." accent="illimité" className="max-w-[15ch]" />

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.7 }}
              className="cord-lede mx-auto mt-6 max-w-[42ch]"
            >
              Tes fichiers, <strong className="font-semibold text-foreground">chiffrés sur ton appareil</strong> et stockés sur ton propre Discord. Sans abonnement, sans limite de taille.
            </motion.p>

            {/* Au-dessus de la carte : en bas de l'écran, ce petit texte serait noyé dans la lumière. */}
            <p className="mt-3 text-sm text-muted-foreground">
              Gratuit, open source · aussi sur{" "}
              <Link href="/download/windows" className="inline-flex min-h-11 items-center px-0.5 font-medium text-foreground underline-offset-4 hover:underline">Windows</Link>
              {" "}et{" "}
              <Link href="/install" className="inline-flex min-h-11 items-center px-0.5 font-medium text-foreground underline-offset-4 hover:underline">iPhone</Link>
            </p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.85 }}
              className="mt-7 flex w-full justify-center"
            >
              <AuthCard id="hero-auth" />
            </motion.div>

            <motion.div variants={v ?? reveal} initial="hidden" animate="show" className="mt-16 w-full">
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
              className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
            >
              {[
                { k: "Stockage", v: <span aria-label="illimité" className="text-5xl leading-[0.9]">∞</span> },
                { k: "bits · AES-GCM", v: <Counter to={256} /> },
                { k: "% open source", v: <Counter to={100} /> },
                { k: "€ d'abonnement", v: <Counter to={0} /> },
              ].map((s) => (
                <motion.div key={s.k} variants={v ?? item} data-soft className="cord-glass relative flex flex-col-reverse rounded-[var(--cord-radius-card)] px-4 py-5 text-center">
                  <dt className="mt-1 text-sm text-muted-foreground">{s.k}</dt>
                  <dd className="cord-accent font-display text-4xl font-semibold tabular-nums">{s.v}</dd>
                </motion.div>
              ))}
            </motion.dl>
          </section>

          {/* ── Features ── */}
          <section className="px-5 py-16 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <SectionHeading kicker="Fonctionnalités" title="Tout ce dont tu as besoin" sub="Un vrai drive, avec la confidentialité en plus." />
              <motion.div variants={v ?? container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {features.map(({ icon: Icon, title, description }) => (
                  <motion.div key={title} variants={v ?? item}>
                    <SpotCard className="h-full">
                      <div className={`mb-4 size-12 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 ${ICON_TILE}`}>
                        <Icon className="size-5" />
                      </div>
                      <h3 className="mb-1.5 font-display text-lg font-semibold tracking-tight">{title}</h3>
                      <p className="text-[15px] text-muted-foreground">{description}</p>
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
              <motion.ol variants={v ?? container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="relative grid gap-8 md:grid-cols-3 md:gap-6">
                <motion.div
                  aria-hidden
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}
                  className="absolute left-[16%] right-[16%] top-8 hidden h-px origin-left bg-gradient-to-r from-[var(--cord-light-mid)] via-[var(--cord-light-core)]/60 to-[var(--cord-light-warm)] md:block"
                />
                {steps.map(({ icon: Icon, title, text }, i) => (
                  <motion.li key={title} variants={v ?? item} className="relative text-center">
                    <div className={`relative mx-auto mb-4 size-16 bg-[var(--cord-ink-2)] ${ICON_TILE}`}>
                      <Icon className="size-7" />
                      <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-[var(--cord-light-core)] font-mono text-xs font-semibold text-[var(--cord-ink)]">{i + 1}</span>
                    </div>
                    <h3 className="mb-1.5 font-display text-lg font-semibold tracking-tight">{title}</h3>
                    <p className="mx-auto max-w-xs text-[15px] text-muted-foreground">{text}</p>
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
                  <motion.div key={t.who} variants={v ?? item} data-soft className="cord-glass relative rounded-[var(--cord-radius-card)] p-6 transition-transform duration-300 hover:-translate-y-1">
                    <t.icon className={`mb-3 size-6 ${t.text}`} />
                    <h3 className={`mb-2 font-display text-lg font-semibold ${t.text}`}>{t.who}</h3>
                    <p className="text-[15px] text-muted-foreground">{t.sees}</p>
                  </motion.div>
                ))}
              </motion.div>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Code ouvert, primitives standard (AES-256-GCM, Argon2id), modèle de menace publié —{" "}
                <Link href="/docs/securite/chiffrement" className="inline-flex min-h-11 items-center text-[var(--cord-light-mid)] underline-offset-4 hover:underline">voir comment ça marche</Link>.
              </p>
            </div>
          </section>

          {/* ── Developers ── */}
          <section className="px-5 py-20 sm:px-6">
            <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2">
              <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
                <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--cord-light-mid)]">Développeurs</p>
                <h2 className="mb-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.02] tracking-[-0.035em]">Intègre Drivecord dans ton site</h2>
                <p className="mb-6 text-[15px] text-muted-foreground">
                  Un bouton d&apos;upload et une visionneuse chiffrés de bout en bout en quelques lignes. Ton site ne voit jamais ni les clés, ni les noms.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a href="https://developers.cordsuite.app/sdk" data-primary className="cord-button h-11 gap-2 px-5 text-[15px]">
                    Voir le SDK <ArrowRight className="size-4" />
                  </a>
                  <a href="https://developers.cordsuite.app/api/drivecord" className="cord-button h-11 gap-2 px-5 text-[15px]">
                    <Link2 className="size-4" />API v2
                  </a>
                </div>
              </motion.div>
              <motion.pre variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="cord-glass relative overflow-x-auto rounded-[var(--cord-radius-card)] p-5 font-mono text-xs leading-relaxed"><code>
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
              <div data-soft className="cord-glass relative divide-y divide-border overflow-hidden rounded-[var(--cord-radius-panel)]">
                {faq.map((f) => (
                  <details key={f.q} className="group px-5 transition-colors open:bg-[color-mix(in_srgb,var(--cord-light-mid)_6%,transparent)] sm:px-6 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium">
                      {f.q}
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--cord-light-mid)_16%,transparent)] text-lg leading-none text-[var(--cord-light-core)] transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="pb-4 text-[15px] text-muted-foreground">{f.a}</p>
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
              className="mx-auto flex max-w-3xl flex-col items-center text-center"
            >
              <h2 className="mb-3 font-display text-[clamp(2.25rem,6vw,3.75rem)] font-semibold leading-[0.98] tracking-[-0.045em]">
                Commence <Accent>maintenant</Accent>
              </h2>
              <p className="cord-lede mb-8 max-w-md">Un webhook Discord suffit. Aucune carte bancaire, aucune installation.</p>
              <div className="flex w-full justify-center">
                <AuthCard compact />
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <StatusLink />
                <a href="https://github.com/LeVraiLunatix/drivecord" target="_blank" rel="noopener noreferrer" className="cord-button h-11 gap-2 px-4 text-sm">
                  <ExternalLink className="size-4" />
                  Code source
                </a>
              </div>
            </motion.div>
          </section>
        </main>

        {/* ── Footer ── */}
        <footer className="border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              <Link href="/docs" className="inline-flex min-h-11 items-center hover:text-foreground">Documentation</Link>
              <Link href="/conditions" className="inline-flex min-h-11 items-center hover:text-foreground">Conditions &amp; mentions légales</Link>
              <a href={STATUS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 hover:text-foreground">
                <Activity className="size-3.5" />Statut
              </a>
              <Link href="https://github.com/LeVraiLunatix/drivecord" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center hover:text-foreground">
                Code source
              </Link>
            </nav>
            <p>
              <Link href="/" className="inline-flex min-h-11 items-center font-display font-semibold text-foreground hover:opacity-80">Drive<Accent>cord</Accent></Link> · open source
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

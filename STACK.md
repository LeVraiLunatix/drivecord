# STACK.md — Reconnaissance (Phase 0)

État des lieux établi en lisant le code réel, avant l'implémentation du système
d'authentification avancé (passkeys, vérif email, 2FA, approbation cross-device).

## Stack détectée

| Domaine | Réalité |
|---|---|
| Framework | **Next.js 16** (App Router), React 19, TypeScript |
| Paquets | **npm** (`package-lock.json`) |
| ORM / DB | **Prisma 7** → PostgreSQL · client généré dans `src/generated/prisma` |
| Auth | **Auth.js v5** (`next-auth@5 beta`), **stratégie JWT** |
| Middleware | **`src/proxy.ts`** (Next 16 a renommé `middleware` → `proxy`) |
| UI | Tailwind 4 · shadcn/ui (Radix) · Motion · sonner (toasts) · lucide |
| Email | `resend` installé + `AUTH_RESEND_KEY`/`EMAIL_FROM` présents dans `.env`, **mais jamais câblés** (aucun helper/template). `.env.example` ne les liste pas. |
| Rate-limit | **Inexistant** |

## Flux d'authentification actuel

- `src/auth.ts` : config complète (Node) — PrismaAdapter + `session.strategy:"jwt"`.
  Providers : Google, Discord (`allowDangerousEmailAccountLinking`), Credentials (bcrypt).
- `src/auth.config.ts` : config edge — callbacks `jwt`/`session` (attachent `id`),
  `authorized` protège `/drive /setup /settings /admin /stats /shares /backup`.
- `src/proxy.ts` : applique `authorized` sur toutes les routes hors `api`/static.
- Sessions **non stockées en DB** (JWT). La table `Session` existe mais dort.
- Inscription `POST /api/auth/register` : crée l'user, **n'envoie aucun email**,
  `emailVerified` reste `null`. La page `/login` a déjà l'état `?verify=1` câblé.
- Flux natif iOS : OAuth navigateur système → code HMAC stateless
  (`lib/auth/native-code.ts`) → `GET /api/native-auth/exchange` **forge le cookie
  de session via `encode()` de `next-auth/jwt`** puis redirige vers `/drive`.
  ⭐ Ce mécanisme `encode()` est réutilisable pour ouvrir une session APRÈS un
  challenge multi-facteur, sans passer par `authorize()`.

## Modèle de données (extrait pertinent — `prisma/schema.prisma`)

- `User` possède déjà : `emailVerified`, `password` (bcrypt), `vaultPin` (bcrypt),
  `vaultSalt` (sel PBKDF2). Manquent : `lastLoginAt`, `twoFactorEnabled`, etc.
- `Webhook.encKey` : clé de chiffrement **par drive** (AES-256-GCM), stockée
  chiffrée côté serveur avec `ENCRYPTION_KEY`.

## Flux de la clé E2EE (point critique)

**L'E2EE est déjà entièrement découplé du mot de passe de login :**

1. **Fichiers normaux** → clé aléatoire **par drive**, générée client
   (`crypto.getRandomValues`), stockée *chiffrée* côté serveur (`ENCRYPTION_KEY`)
   dans `Webhook.encKey`, **re-téléchargée après authentification** via
   `/api/webhooks` (`lib/auth/sync.ts`). Le facteur de login n'intervient jamais.
2. **Coffre-fort** → clé dérivée du **PIN** via PBKDF2 (200k itérations, SHA-256)
   + `vaultSalt`. Indépendante du mot de passe.

➡️ **Conséquence : passkeys / OAuth / cross-device ne cassent rien.** Aucun
wrapping multi-facteur ni PRF WebAuthn n'est nécessaire.

⚠️ **Nuance** : le serveur détient la clé des fichiers normaux (ce n'est donc PAS
du zero-knowledge — c'est déjà le cas aujourd'hui, et c'est ce qui permet les
partages publics par déchiffrement serveur). Seul le coffre est zero-knowledge.

## Décisions validées avec le porteur du projet

1. **Modèle E2EE : inchangé** (la clé reste récupérée du serveur après login).
2. **Rate-limiting : table PostgreSQL** (aucune dépendance externe).
3. **Cross-device : polling** (3–5 s) ; push iOS native laissée en TODO documenté.

## Décision d'architecture centrale : JWT « step-up »

Le JWT porte un palier `level: "pending" | "full"`. À la fin du 1er facteur, le
token est `pending` ; `proxy.ts` bloque les routes protégées et redirige vers le
challenge tant que le 2e facteur requis (email 24 h / 2FA / approbation
cross-device) n'est pas levé ; une route API « promeut » le token en `full`.
Uniforme pour Credentials, OAuth et passkey ; réutilise l'`encode()` déjà en place.

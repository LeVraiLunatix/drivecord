# Prompt Claude Code — page de statut `status.drivecord.app`

> Copie tout ce qui suit dans Claude Code, lancé à la racine du dépôt `drivecord` sur ton PC
> (`claude` puis colle le prompt, ou `claude -p "$(cat docs/prompt-status-page.md)"`).

---

Tu travailles en **autonomie complète** sur le dépôt `LeVraiLunatix/drivecord` (Next.js 16, React 19, Prisma 7, Auth.js v5, Vitest, Playwright dispo). Ne me pose pas de questions : choisis la meilleure option, note tes choix dans la PR. Les messages utilisateur sont en **français**, le code et les commentaires en **anglais**.

## 0. Avant de coder
1. Lis `AGENTS.md` : ce Next.js a des changements majeurs (`proxy.ts` remplace le middleware, `params` est une Promise dans les route handlers…). Lis les guides pertinents dans `node_modules/next/dist/docs/` avant d'écrire du code Next.
2. Lis `RELEASE.md`, `CHANGELOG.md`, `SECURITY.md`, `src/app/api/health/route.ts`, `src/components/status-banner.tsx`, `src/proxy.ts`, `src/lib/rate-limit.ts`, `e2e/infra.sh` (comment lancer la stack de test), `src/components/home/landing.tsx` (direction visuelle : sobre, calme, une seule couleur d'accent, beaucoup d'espace).
3. Travaille sur une branche `feat/status-page` (jamais directement sur `master`). Commits clairs. À la fin : ouvre une PR vers `master` avec un résumé, **ne la merge pas**.

## 1. Objectif
Créer une page publique de statut, servie sur **`status.drivecord.app`**, qui montre l'état de **absolument tous les systèmes de Drivecord**, l'historique des incidents/maintenances, et les **nouveautés** (changelog du site).

### Contrainte d'architecture n°1 : la page de statut doit rester en ligne quand Drivecord est en panne
Une page de statut hébergée sur la même base de données / le même déploiement tombe avec le reste. Donc :
- Crée un **projet Next.js séparé et minimal** dans `status/` (dossier racine du projet Vercel dédié), **sans Prisma, sans Auth.js, sans dépendance à la base de Drivecord**.
- Il interroge Drivecord **de l'extérieur** (HTTP) avec des timeouts courts (≤ 5 s) et un User-Agent identifiable (`DrivecordStatus/1`).
- Rendu serveur avec revalidation courte (ISR ~30 s) + rafraîchissement client toutes les 30–60 s ; si ses propres sondes échouent, il affiche « Impossible de vérifier » plutôt qu'un faux « opérationnel ».
- Réutilise le design system existant autant que possible (copie les tokens Tailwind/CSS nécessaires ; pas d'import depuis `src/` du projet principal pour ne pas créer de couplage de build).

## 2. Systèmes à surveiller (inventaire à vérifier dans le code)
Parcours `src/app/api/**`, `src/lib/**`, `src/app/**` et `.env.example` pour **confirmer et compléter** cette liste, puis regroupe-la. Pour chaque composant : nom FR, courte description, sonde, statut (`operational | degraded | partial_outage | major_outage | maintenance | unknown`), latence.

**Application web**
- Site & accueil (`/`), Documentation (`/docs`), Application drive (`/drive`)
- Page de partage (`/s/<token>`), Fichiers publics (domaine `USERCONTENT_ORIGIN`)
- Administration (si accessible publiquement : seulement le code HTTP, jamais de données)

**Compte & sécurité**
- Connexion (Compte Cord, Discord, Google, email/mot de passe), Passkeys, Double authentification / codes par email
- Clés de chiffrement (`/api/e2ee/keys`), Approbation d'un nouvel appareil
- Coffre-fort

**Stockage**
- Base de données (via `/api/health` : champ `db`)
- Discord — API webhooks & CDN (champ `discord` de `/api/health`, + sonde CDN)
- Envoi de fichiers, Téléchargement de fichiers (relais Discord)
- Liens de partage

**Développeurs**
- API v2 (`/api/v2/me` doit répondre 401 JSON propre sans jeton : c'est « sain »), API v1 (dépréciée)
- OAuth (`/.well-known/oauth-authorization-server`, endpoint token), SDK & iframes (`/embed/upload`), `openapi-v2.json`

**Services annexes**
- E-mails transactionnels, Notifications push, Synchronisation Patreon, Hub Cord
- Mises à jour de l'app Windows (endpoint updater), App iPhone (flux de mise à jour)

Règles de sondage :
- **Aucune sonde ne doit nécessiter de secret** ni créer de données. N'utilise que des GET publics et des codes de réponse **attendus** (ex. 200, ou 401 JSON pour une route authentifiée).
- Ajoute côté Drivecord (projet principal, branche séparée dans la même PR) une route publique **`GET /api/health/components`** : renvoie `{ components: [{ id, status, latencyMs }] }` pour db, discord, auth (sa propre vérification d'infrastructure), email/push/patreon **uniquement si la vérification est sans effet de bord** (sinon `unknown`). Cache 15 s, rate-limit (`src/lib/rate-limit.ts`), aucune info sensible (pas de versions, pas d'URLs internes, pas d'erreurs brutes). Complète `MAINTENANCE_MESSAGE` : s'il est défini, les composants concernés passent en `maintenance`.
- Un composant est « dégradé » si latence > seuil défini (ex. 2 s) ou 1 échec isolé ; « panne partielle » après 2 échecs consécutifs ; « panne majeure » après 3+ ou si db est down.

## 3. Historique & incidents
- Stocke l'historique des sondes **90 jours** sans toucher à la base de Drivecord. Choix recommandé : **Vercel Cron** (toutes les minutes ou 5 min) qui écrit dans **Vercel KV/Upstash Redis ou Vercel Blob** ; fournis une abstraction `store` avec une implémentation mémoire pour le dev/tests.
- Barres d'uptime 90 jours par composant (survol = date, % de disponibilité, durée de panne), + uptime global.
- **Incidents & maintenances** : fichier versionné `status/content/incidents/*.md` (frontmatter : `title`, `status` = investigating|identified|monitoring|resolved, `components`, `severity`, `startedAt`, `resolvedAt`, et un journal de mises à jour datées en markdown). Ils s'affichent en haut (incidents actifs) et dans l'historique. Un incident actif peut forcer le statut d'un composant.
- Page `/history` (incidents passés, groupés par mois), page `/incidents/[slug]`.
- Flux **RSS/Atom** (`/feed.xml`) et **API JSON publique** (`/api/status` + `/api/status/summary`, CORS `*` lecture seule) pour que d'autres outils lisent le statut.

## 4. Nouveautés (changelog du site)
- Section « Nouveautés » avec les changements notables de Drivecord, **lus depuis `CHANGELOG.md` du dépôt principal** (récupéré au build via l'API GitHub raw de `LeVraiLunatix/drivecord@master`, avec revalidation ISR ; repli sur une copie locale `status/content/changelog.md` si l'accès échoue).
- Parse les sections `## Titre` en entrées datables (si pas de date, utilise la date du commit via l'API GitHub). Rends le markdown de façon sûre (pas de HTML brut ; liste blanche).
- Contenu à faire apparaître au minimum (Drivecord 1.0) : vrai chiffrement de bout en bout (contenu, noms, dossiers ; clé de récupération, phrase, passkey, approbation d'appareil, PIN du coffre jamais envoyé), applications OAuth + API v2 + SDK navigateur/Node + iframes, bannière de statut, corbeille (restaurer/vider), recherche dans tout le drive, vignettes d'images chiffrées, refonte de l'accueil et du drive, fin de la bêta.

## 5. Design & UX
- Sobre, lisible, mobile d'abord, thème clair/sombre (suit le système), accessible (contraste AA, `aria-live` pour le bandeau global, barres d'uptime navigables au clavier avec texte alternatif).
- En-tête : logo + « Statut de Drivecord », liens Retour au site / Documentation / Nouveautés / Historique.
- **Bandeau global** en haut : « Tous les systèmes sont opérationnels » (vert discret) ou la pire situation en cours (jaune/orange/rouge). Si une maintenance est prévue : bandeau jaune avec dates (heure locale du visiteur + UTC).
- Liste des composants par groupe, repliable, avec pastille d'état, latence (p50 sur 24 h), uptime 90 j.
- Pas de dépendance lourde : pas de lib de graphiques ; barres en CSS/SVG. Poids de la page < 150 Ko JS.
- Tout le texte en français ; dates `Intl.DateTimeFormat('fr-FR')`.

## 6. Déploiement (à préparer, pas à exécuter sans moi)
- Rédige `status/README.md` : variables d'environnement, création du projet Vercel (Root Directory = `status`), domaine `status.drivecord.app` (enregistrement DNS CNAME vers `cname.vercel-dns.com`), configuration des Cron Jobs, du KV/Blob, et la liste des variables (`DRIVECORD_ORIGIN=https://drivecord.app`, `USERCONTENT_ORIGIN`, jetons de stockage…).
- Ajoute un workflow GitHub Actions `status-deploy-check.yml` qui lance lint + tests + build de `status/` sur les PR touchant `status/`.
- Dans le projet principal, ajoute un lien discret « Statut » dans le pied de page de l'accueil et dans les Paramètres, et fais pointer le bandeau `StatusBanner` vers `https://status.drivecord.app` (lien « En savoir plus » quand il est affiché).

## 7. Qualité (obligatoire)
- Tests Vitest : agrégation des statuts (règles de la section 2), parsing du changelog, parsing des incidents, abstraction `store`, génération du flux RSS, sérialisation de l'API JSON.
- Test e2e Playwright (Chromium est installé ; ne lance **pas** `playwright install`) : page affichée avec des sondes simulées (opérationnel, dégradé, panne, inconnu), incident actif, maintenance, mobile 390 px et bureau 1280 px, thème clair/sombre. Aucune erreur console, aucun débordement horizontal.
- `tsc`, `eslint` et `next build` doivent passer dans `status/` **et** dans le projet principal (voir `AGENTS.md`).
- Sécurité : aucune donnée sensible exposée, sondes en lecture seule, rate-limit sur la nouvelle route de Drivecord, CSP stricte et en-têtes de sécurité sur la page de statut, pas de HTML non échappé.
- N'invente pas de chiffres : si l'historique est vide au premier démarrage, affiche « Historique en cours de constitution » plutôt que 100 %.

## 8. Fin de mission
Quand tout est vert : pousse la branche, ouvre la PR vers `master` (ne merge pas), et rends-moi un compte rendu court : ce qui a été fait, les choix d'architecture, les captures d'écran (clair/sombre, mobile/bureau, état normal et en panne simulée), et **la liste exacte de ce que je dois faire à la main** (créer le projet Vercel, DNS, variables, KV/Blob, activer les Cron).

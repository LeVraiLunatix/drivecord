# Page de statut — status.drivecord.app

Page publique qui montre l'état de **tous** les systèmes de Drivecord, l'historique des incidents et des
maintenances, et les nouveautés (changelog).

**Elle est volontairement séparée de l'application** : projet Next.js à part (ce dossier), sans Prisma, sans
Auth.js, sans accès à la base de Drivecord. Elle interroge Drivecord *de l'extérieur* (HTTP, timeouts de 5 s,
User-Agent `DrivecordStatus/1`) et garde son historique dans son propre stockage. Quand Drivecord tombe, la
page de statut reste en ligne et le dit.

## Ce qu'elle surveille

34 composants en 5 groupes, définis dans [`src/lib/components.ts`](src/lib/components.ts) : application web,
compte & sécurité, stockage, développeurs, services annexes.

- Toutes les sondes sont des **GET publics en lecture seule**, sans secret, qui ne créent aucune donnée. Une
  route authentifiée est « saine » quand elle répond un `401` JSON propre à un appel anonyme ; un jeton de
  partage inexistant doit répondre `404`.
- Les états internes (base de données, Discord, authentification, e-mail, Patreon) viennent de la route
  **`GET /api/health/components`** de Drivecord, une seule requête pour tous. Les notifications push n'ont
  aucune vérification sans effet de bord : elles s'affichent « Non vérifié » plutôt que d'inventer un état.
- Une requête témoin (par défaut `cloudflare.com/cdn-cgi/trace`) distingue « Drivecord est en panne » de « ce
  service n'a plus de réseau » : dans le second cas, rien n'est enregistré (pas de fausse panne totale).

### Règles d'état

| Situation | État |
| --- | --- |
| Réponse attendue et rapide (≤ 2 s) | Opérationnel |
| Réponse plus lente que le seuil, ou **un** échec isolé | Dégradé |
| 2 échecs consécutifs | Panne partielle |
| 3 échecs consécutifs ou plus | Panne majeure |
| La base de données échoue (ou un composant qui en dépend échoue pendant ce temps) | Panne majeure immédiate |
| Un composant dont dépend un autre (`needs`) est en panne | Le dépendant n'est jamais meilleur que lui |
| Drivecord ne peut pas être interrogé sur un point | Non vérifié (jamais « opérationnel » par défaut) |
| `MAINTENANCE_MESSAGE` défini côté Drivecord | Composants concernés en Maintenance |

Disponibilité sur 90 jours : *opérationnel + dégradé* comptent comme disponibles, *panne partielle + majeure*
comme indisponibles ; maintenance et non vérifié sont ignorés. Tant que l'historique est trop court, la page
affiche « Historique en cours de constitution » au lieu d'un faux 100 %.

## Incidents et maintenances

Un fichier Markdown par incident dans [`content/incidents/`](content/incidents) (modèle :
[`_template.md`](content/incidents/_template.md), les fichiers commençant par `_` sont ignorés). Un fichier
mal formé est ignoré avec un avertissement dans les logs, il ne casse jamais la page.

```md
---
title: Envoi de fichiers ralenti
status: monitoring        # investigating | identified | monitoring | resolved
severity: degraded        # degraded | partial_outage | major_outage | maintenance
components: [upload]      # ids de composants, ou "all"
startedAt: 2026-10-01T10:00:00Z
resolvedAt:               # rempli quand status = resolved
endsAt:                   # fin prévue (maintenance)
summary: Les envois de gros fichiers sont plus lents que d'habitude.
---
## 2026-10-01T10:00:00Z — investigating
Nous enquêtons.

## 2026-10-01T10:40:00Z — monitoring
Un correctif est déployé, nous surveillons.
```

- Un incident **actif** (pas `resolved`, déjà commencé) apparaît en haut et **impose son état** aux composants
  listés (si c'est pire que l'état mesuré).
- Une maintenance dont `startedAt` est dans le futur s'affiche en bandeau jaune avec les dates (heure locale du
  visiteur + UTC), sans rien forcer avant son début.
- Publier = commit + push : le déploiement met la page à jour.

## Nouveautés

Lues depuis `CHANGELOG.md` de `LeVraiLunatix/drivecord@master` (raw GitHub, revalidé toutes les 10 min), avec
repli sur la copie [`content/changelog.md`](content/changelog.md) si GitHub est inaccessible. Chaque section
`## Titre` devient une entrée. Une date dans le titre (`## Titre (2026-10-01)`) est prioritaire ; sinon la date
du commit de même rang sur `CHANGELOG.md` (API GitHub) est utilisée — approximation qui tient tant que chaque
commit ajoute une section. Sans date connue, aucune date n'est affichée. Le Markdown est rendu de façon sûre
(HTML brut jamais rendu, éléments en liste blanche, liens `javascript:` supprimés).

## API publique

- `GET /api/status` — tous les composants (état, latence, disponibilité 90 j), incidents actifs, maintenances prévues.
- `GET /api/status/summary` — l'indicateur global (`none|minor|major|critical|maintenance|unknown`), léger à interroger.
- `GET /feed.xml` — flux Atom des incidents, maintenances et nouveautés.

CORS `*`, lecture seule. Aucune donnée interne n'y figure.

## Architecture

```
visiteur ──► page (ISR 30 s) ──► getSnapshot() ──► store (Upstash/KV) ◄── /api/cron/probe (toutes les 5 min)
                                      │  (si les données ont > 4 min : sonde elle-même)
                                      └──► sondes HTTP ──► drivecord.app, Discord, Google, GitHub…
```

- **Stockage** : abstraction `Store` ([`src/lib/store.ts`](src/lib/store.ts)). Redis Upstash / Vercel KV via son API
  REST (aucune dépendance), ou mémoire en dev et en test. Données : dernier état, un journal d'échantillons par
  jour (TTL 100 j), un cumul quotidien par composant (90 j). ≈ 6 commandes Redis par cycle de sonde.
- **Page** : statique régénérée au plus toutes les 30 s ; l'endpoint cron régénère aussi la page tout de suite.
  Un petit script côté client (≈ 2 Ko) rafraîchit un onglet ouvert quand un nouveau cycle existe.
- **Sans planificateur** la page reste vivante : une visite qui trouve des données de plus de 4 min lance elle-même
  un cycle. Le planificateur sert à constituer l'historique même sans visiteur.
- **Barres de 90 jours** : un dégradé CSS unique par composant + une chaîne compacte ; tooltip au survol / au
  toucher, et au clavier (← → Début Fin) avec annonce par un `aria-live`.
- **Sécurité** : CSP stricte (`default-src 'none'`, aucune ressource tierce, `frame-ancestors 'none'`…), HSTS,
  `nosniff`. `script-src` autorise `'unsafe-inline'` car l'App Router insère ses données d'hydratation dans des
  balises inline (les nonces imposeraient un rendu dynamique, donc plus d'ISR ; le SRI expérimental ne couvre pas
  ces balises — essayé, la page ne s'hydratait plus). Aucun contenu utilisateur n'est jamais rendu en HTML.

## Variables d'environnement

Voir [`.env.example`](.env.example).

| Variable | Rôle |
| --- | --- |
| `DRIVECORD_ORIGIN` | URL publique de Drivecord (`https://drivecord.app`) |
| `USERCONTENT_ORIGIN` | Domaine des fichiers publics (même valeur que dans Drivecord). Vide : composant masqué |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Stockage de l'historique (Upstash / Vercel KV) |
| `CRON_SECRET` | Secret de `/api/cron/probe` (sans lui, la route est fermée) |
| `NEXT_PUBLIC_SITE_URL` | URL de cette page (`https://status.drivecord.app`) : flux, liens de l'API |
| `GITHUB_TOKEN` | Optionnel : relève la limite de l'API GitHub utilisée pour dater les nouveautés |
| `CORD_ISSUER`, `CORD_HUB_URL`, `DESKTOP_UPDATER_URL`, `IOS_SOURCE_URL` | Optionnel : surchargent les URL par défaut |

## Mise en ligne (à faire une fois)

1. **Projet Vercel** : *Add New → Project*, dépôt `LeVraiLunatix/drivecord`, **Root Directory = `status`**,
   framework Next.js. Ne pas toucher au projet Drivecord existant.
2. **Stockage** : dans le projet, *Storage → Marketplace → Upstash Redis* (offre gratuite suffisante). Vercel
   ajoute `KV_REST_API_URL` et `KV_REST_API_TOKEN` tout seul.
3. **Variables** : `DRIVECORD_ORIGIN`, `USERCONTENT_ORIGIN`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` (une longue
   chaîne aléatoire, ex. `openssl rand -hex 32`).
4. **Domaine** : *Settings → Domains → Add* `status.drivecord.app`, puis chez le registrar un enregistrement
   `CNAME  status → cname.vercel-dns.com`.
5. **Planificateur** (choisir un) :
   - *Vercel Cron* : `vercel.json` déclare un passage quotidien (le plan Hobby n'accepte rien de plus fréquent,
     sinon le déploiement échoue). Il suffit de définir `CRON_SECRET` : Vercel l'envoie en `Authorization: Bearer`.
     Sur un plan **Pro**, remplacer `0 3 * * *` par `*/5 * * * *`.
   - *GitHub Actions* : le workflow [`status-probe.yml`](../.github/workflows/status-probe.yml) appelle la route
     toutes les 5 min dès que les secrets `STATUS_CRON_SECRET` (même valeur que `CRON_SECRET`) et la variable
     `STATUS_URL` existent. Gratuit tant que le dépôt est public.
   - *Service externe* (cron-job.org, UptimeRobot…) : `GET https://status.drivecord.app/api/cron/probe` avec
     l'en-tête `Authorization: Bearer <CRON_SECRET>`, toutes les 1 à 5 min.
6. **Côté Drivecord** : déployer la branche (route `/api/health/components`). Optionnel :
   `MAINTENANCE_COMPONENTS` pour limiter une maintenance à certains composants.

Vérifier : `curl https://status.drivecord.app/api/status/summary` puis `curl -H "Authorization: Bearer $CRON_SECRET"
https://status.drivecord.app/api/cron/probe`.

## Développement

```bash
cd status
npm install
npm run dev          # http://localhost:3030 (mémoire, sonde drivecord.app par défaut)
npm run lint && npm run typecheck && npm test
npm run build && npm run e2e
```

`npm run e2e` lance un faux Drivecord ([`e2e/fake-drivecord.mjs`](e2e/fake-drivecord.mjs)) et le vrai serveur de
production, puis déroule les scénarios (opérationnel, dégradé, panne qui s'aggrave, base de données HS, endpoint
de santé absent, maintenance, incident actif…). La partie navigateur (clair/sombre, 1280 px et 390 px, console
sans erreur, aucun débordement horizontal, infobulle et clavier, captures dans `e2e/shots/`) s'active si un
Chromium est trouvé (`E2E_CHROME=/chemin/vers/chrome`) ; sinon elle est sautée et le dit.

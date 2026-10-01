# Prompt Claude Code — mise en production de Drivecord 1.0 (Prisma, env, builds, SDK)

> À coller dans Claude Code, lancé à la racine du dépôt `drivecord` sur ton PC, **après** avoir fait `git checkout master && git pull`.
> Ce prompt travaille sur la **production** : il est volontairement prudent (voir « Règles de sécurité »).

---

Tu prépares et vérifies la mise en production de **Drivecord 1.0** (PR #18 déjà fusionnée dans `master`). Réponds et commente en **français** ; code et commits en **anglais**. Lis d'abord `AGENTS.md` (ce Next.js a des changements majeurs), `RELEASE.md`, `SECURITY.md`, `.env.example` et `docs/usercontent-domain.md`.

## Règles de sécurité (impératives)
1. **Aucune action destructive sur la base de production** : pas de `migrate reset`, pas de `db push --accept-data-loss`, pas de `DROP`, pas de suppression de colonne/table. Seulement `prisma migrate deploy` (migrations additives déjà écrites).
2. **Avant toute commande qui touche la base de production** : demande-moi de confirmer que j'ai fait une **sauvegarde** (snapshot du fournisseur ou `pg_dump`), et **attends ma réponse**. N'enchaîne jamais seul.
3. Ne jamais afficher, journaliser ni committer un secret (`DATABASE_URL`, `ENCRYPTION_KEY`, `AUTH_SECRET`, jetons). Si un secret doit être saisi, demande-moi de l'exporter dans mon shell (`export DATABASE_URL=…`) plutôt que de le coller dans un fichier.
4. Ne supprime **jamais** `Webhook.encKey`, l'ancien chemin d'upload ni `src/lib/crypto/file-server-crypto.ts` : le nettoyage legacy n'est PAS dans cette mission (voir étape 6).
5. Pas de `git push --force`, pas de commit direct sur `master` : toute modification passe par une branche `chore/release-1.0` et une PR que tu **ne merges pas**.

## Étape 1 — Vérifier le dépôt en local
- `npm ci`, puis `npx prisma generate`, `npx tsc --noEmit`, `npm test`, `npm run build`. Corrige ce qui casse (sur la branche de travail), sinon décris le problème.
- Compare `prisma/migrations/` avec la liste attendue : tout de `20260930120000_api_key_expiry_ip_allowlist` à `20260930170500_upload_session_v2` doit être présent et **uniquement additif** (vérifie qu'aucun fichier `migration.sql` ne contient `DROP TABLE`, `DROP COLUMN` ni `DELETE FROM`). Signale-moi toute exception.

## Étape 2 — Base de données de production (avec ma confirmation)
1. Demande-moi mon `DATABASE_URL`/`DIRECT_URL` de **production** (dans mon environnement) et la confirmation de sauvegarde.
2. `npx prisma migrate status` pour lister ce qui reste à appliquer.
3. Après confirmation : `npx prisma migrate deploy`. Vérifie ensuite `prisma migrate status` = « up to date ».
4. Lance `node scripts/e2ee-migration-status.mjs` (lecture seule) et rapporte le tableau ; ne fais rien d'autre avec.

## Étape 3 — Variables d'environnement
- Compare `.env.example` avec ce dont l'app a besoin (cherche `process.env.` dans `src/`). Rédige la liste **exacte** des variables à créer/vérifier sur Vercel, avec pour chacune : obligatoire ou non, valeur attendue (sans valeurs secrètes), et où la générer. Inclure au minimum : `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `AUTH_URL`, `USERCONTENT_ORIGIN`, `MAX_API_GIB_PER_DAY`, `MAX_API_FILES_PER_DRIVE`, `MAINTENANCE_MESSAGE` (vide), `INTERNAL_ORIGIN` (normalement inutile sur Vercel).
- Vérifie que `ENCRYPTION_KEY` n'a **pas changé** par rapport à la production actuelle (la changer rendrait les webhooks stockés illisibles) : rappelle-le-moi explicitement.
- Si le CLI Vercel est installé et que je suis connecté (`vercel whoami`), liste les variables existantes (`vercel env ls`) pour comparer, **sans afficher les valeurs**. Sinon, donne-moi la checklist à faire dans le tableau de bord.

## Étape 4 — Domaine isolé pour les fichiers publics
Suis `docs/usercontent-domain.md` : explique et prépare (sans l'exécuter sans moi) l'ajout d'un domaine dédié (ex. `usercontent.drivecord.app`) dans Vercel + DNS, et la variable `USERCONTENT_ORIGIN`. Vérifie dans le code (`src/proxy.ts`, `src/lib/usercontent.ts`) que, une fois définie, ce domaine ne sert que `/api/v1/public/…`.

## Étape 5 — Applications et paquets
- **Windows** : lance `node scripts/build-desktop.mjs` et confirme que `out/` est généré ; décris les étapes restantes pour construire/signer/publier l'installeur Tauri selon la config du dépôt (ne publie rien sans moi).
- **iPhone** : vérifie que le projet `ios/` et la config Capacitor ne référencent rien d'obsolète ; liste ce que je dois faire pour reconstruire et soumettre.
- **SDK** : `node packages/sdk/build.mjs` (affiche la taille gzip et le hash SRI) et `node packages/node/build.mjs`. Prépare (sans publier) `npm pack --dry-run` pour `packages/sdk` et `packages/node`, et dis-moi si le nom `@drivecord/*` est libre (`npm view @drivecord/sdk`). Ne lance `npm publish` que si je te le demande explicitement.

## Étape 6 — Nettoyage legacy (préparation uniquement)
Ne supprime rien. Prépare une branche **non mergée** `chore/e2ee-legacy-cleanup` qui contient le plan et le code du nettoyage (suppression de `Webhook.encKey` via une migration, retrait du chemin d'upload legacy et de `file-server-crypto.ts`), prêt à être appliqué **seulement quand** `scripts/e2ee-migration-status.mjs` affiche `READY` sur la production. Mets cette condition en gras dans la description de la PR (brouillon) et n'y touche plus.

## Étape 7 — Vérification après déploiement
Une fois que j'aurai confirmé que le déploiement Vercel est vert, écris et lance un script **en lecture seule** contre `https://drivecord.app` qui vérifie : `/api/health` (200, `db: true`), `/api/v2/me` sans jeton (401 JSON `{error:{code:"unauthorized"}}`), `/.well-known/oauth-authorization-server`, `/openapi-v2.json`, en-têtes de sécurité (`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`), `/embed/upload?client_id=app_unknownunknown00` (en-tête `Content-Security-Policy: frame-ancestors 'none'`), et qu'aucune page publique ne renvoie 5xx (`/`, `/login`, `/register`, `/docs`, `/conditions`). N'exécute aucune écriture.

## Fin de mission
Rends-moi un compte rendu court : ✅ fait / ⚠️ à vérifier / ❌ bloqué, la **liste exacte de ce que je dois faire à la main** (dans l'ordre), et le lien de la PR `chore/release-1.0` si tu as modifié quoi que ce soit.

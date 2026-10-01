# Domaine de contenu séparé (`USERCONTENT_ORIGIN`)

Les fichiers que les utilisateurs envoient peuvent être servis à des tiers
(liens publics, hotlinks). Tant qu'ils sont servis **depuis la même origine que
l'application**, un défaut dans les en-têtes (un HTML ou un SVG qui s'exécute)
devient un vol de session. Un domaine dédié règle le problème à la racine : même
un script qui s'y exécuterait n'a ni cookie ni accès à l'app.

Drivecord applique déjà, sur toutes les routes qui servent des octets
(`src/lib/safe-file-headers.ts`) : `nosniff`, CSP `sandbox`, liste blanche
d'affichage `inline`, tout le reste forcé en téléchargement
`application/octet-stream`. Le domaine séparé est la **seconde couche**.

## Comportement

Quand `USERCONTENT_ORIGIN` est défini (ex. `https://usercontent.drivecord.app`) :

| Requête | Sur l'origine de l'app | Sur l'origine de contenu |
|---|---|---|
| `/api/v1/public/<token>` (fichiers publics) | **404** | servi |
| tout le reste (pages, `/api/*`, session) | normal | **404** |

Les URL publiques renvoyées par `POST /api/v1/files/:id/public` pointent alors
vers l'origine de contenu. Non défini : comportement actuel (une seule origine).

> ⚠️ Activer la variable casse les anciens liens `https://drivecord.app/api/v1/public/…`
> déjà diffusés (ils répondent 404 sur l'origine de l'app). Prévois de les
> régénérer, ou active la variable au moment où tu peux le faire.

## Configuration

1. **Choisis le domaine.** Idéalement un domaine *distinct* (ex. `drivecordcontent.com`)
   plutôt qu'un sous-domaine de `drivecord.app` : un sous-domaine partage le
   « site » (registrable domain) avec l'app, donc certains cookies mal scopés
   ou le `SameSite` peuvent encore fuiter. Avec un sous-domaine, ne dépose
   **jamais** de cookie avec `Domain=drivecord.app`.
2. **DNS.** Un enregistrement `CNAME` du domaine de contenu vers
   `cname.vercel-dns.com` (ou un `A` vers l'IP indiquée par Vercel).
3. **Vercel.** Project → Settings → Domains → ajoute le domaine de contenu au
   **même projet**. Vercel émet le certificat TLS automatiquement.
4. **Variable d'environnement.** `USERCONTENT_ORIGIN=https://usercontent.drivecord.app`
   (Production, et Preview si besoin), puis redéploie.
5. **Vérifie.**
   ```bash
   # 200 (ou 404 « Lien introuvable ») : servi sur l'origine de contenu
   curl -i https://usercontent.drivecord.app/api/v1/public/<token>
   # 404 : l'app n'est pas joignable sur l'origine de contenu
   curl -i https://usercontent.drivecord.app/api/auth/session
   curl -i https://usercontent.drivecord.app/drive
   # 404 : le contenu n'est plus servi sur l'origine de l'app
   curl -i https://drivecord.app/api/v1/public/<token>
   ```

## En local

`USERCONTENT_ORIGIN=http://localhost:3000` est accepté mais ne sépare rien (même
hôte) : pour tester le routage, ajoute une entrée `127.0.0.1 content.localtest.me`
et utilise `http://content.localtest.me:3000`.

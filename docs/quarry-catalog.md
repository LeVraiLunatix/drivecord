# Catalogue communautaire de Quarry

Catalogue de mods, modpacks, packs de ressources, shaders et plugins, hébergé par Drivecord pour
[Quarry](https://github.com/LeVraiLunatix/quarry) (partenariat Quarry × Cord : Quarry reste un
produit indépendant). Lecture publique sans compte ; **publication réservée à l'administrateur**
(`ADMIN_EMAIL`) avec un jeton personnel. Pas de modération préalable : un contenu fautif se retire
(`DELETE`), et Quarry marque tout ce qui vient d'ici comme « non vérifié ».

Les octets restent dans Drivecord : chaque fichier est un fichier envoyé avec `visibility: "public"`
(API v2) et servi par son lien public (`/api/v1/public/<jeton>`). Le catalogue ne garde que les
métadonnées, le jeton du lien et les empreintes.

## Lecture (publique, limitée à 240 requêtes/min/IP)

Les noms de champs suivent ceux de Modrinth pour que Quarry réutilise ses types.

| Route | Rôle |
| --- | --- |
| `GET /api/catalog/search` | `q`, `type`, `loaders`, `game_version`, `categories`, `sort` (`relevance`, `downloads`, `newest`, `updated`), `offset`, `limit` (50 max) → `{ hits, offset, limit, total_hits }` |
| `GET /api/catalog/projects/{slug}` | Projet avec `body` (Markdown) |
| `GET /api/catalog/projects/{slug}/versions` | Versions, plus récentes d'abord ; `game_version`, `loaders`, `channel` |
| `POST /api/catalog/versions/{id}/downloaded` | Compte une installation réussie (une par IP et par version et par heure) |

Une version : `files[].url`, `files[].hashes.sha1` / `sha512`, `files[].size`, `dependencies[]`
(`source` = `catalog` ou `modrinth`). Quarry vérifie le sha512 avant d'installer.

## Publication (jeton personnel de l'admin)

1. Envoyer le fichier avec l'API v2 (`visibility: "public"`), puis créer son lien public
   (`POST /api/v2/files/{id}/public`) : le jeton obtenu est le `shareToken`.
2. `POST /api/catalog/admin/projects` : `slug`, `projectType` (`mod`, `modpack`, `resourcepack`,
   `shader`, `plugin`), `title`, `summary`, `description`, `categories`, `iconToken`.
3. `POST /api/catalog/admin/projects/{slug}/versions` : `versionNumber`, `name`, `changelog`,
   `channel`, `gameVersions`, `loaders`, `dependencies`, `files[]` (`shareToken`, `filename`, `size`,
   `sha1`, `sha512`, `primary`).
4. `PATCH` / `DELETE /api/catalog/admin/projects/{slug}`, `DELETE …/versions/{id}` : modifier ou
   retirer (retrait doux, les lignes restent).

Contrôles côté serveur : le lien appartient au drive du publieur, n'est ni désactivé, ni expiré, ni
protégé par mot de passe ; le fichier est public et non supprimé ; la taille déclarée est la vraie ;
l'extension correspond au type (`.jar` pour mod/plugin, `.mrpack` pour modpack, `.zip` pour pack de
ressources/shader). Les empreintes déclarées ne sont pas recalculées par le serveur : c'est Quarry qui
les vérifie à l'installation.

## Base de données

Trois tables additives (`CatalogProject`, `CatalogVersion`, `CatalogFile`), migration
`20261015120000_quarry_catalog`. La base de production étant en dérive : ne jamais lancer
`prisma migrate dev` ni `reset` ; appliquer avec `prisma db execute --file …` puis
`prisma migrate resolve --applied 20261015120000_quarry_catalog`.

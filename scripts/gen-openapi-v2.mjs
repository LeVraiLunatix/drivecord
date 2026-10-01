/** Generates public/openapi-v2.json. Run: node scripts/gen-openapi-v2.mjs (a vitest test keeps it in sync with the routes). */
import fs from "node:fs";

const err = (description) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const common = { 401: err("Jeton manquant, invalide ou expiré."), 403: err("Scope insuffisant ou origine non autorisée."), 429: err("Limite de débit atteinte (voir `Retry-After`).") };
const idParam = (name, desc) => ({ name, in: "path", required: true, schema: { type: "string" }, description: desc });
const jsonBody = (ref) => ({ required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } } });
const res = (ref, description = "OK") => ({ description, content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } } });
const idem = { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8, maxLength: 128 }, description: "Rejoue la réponse pendant 24 h si la même requête est renvoyée." };
const cursorParams = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
  { name: "cursor", in: "query", schema: { type: "string" } },
  { name: "parentId", in: "query", schema: { type: "string" }, description: "Dossier ; `\"\"` = racine. Par défaut : dossier de l'application (apps) / tout le drive (jetons personnels)." },
  { name: "trashed", in: "query", schema: { type: "boolean", default: false } },
];
const op = (summary, scope, extra = {}) => ({ summary, description: `Permission requise : ${scope}.`, security: [{ bearer: [] }], responses: { ...common, ...(extra.responses ?? {}) }, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "responses")) });

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Drivecord API v2",
    version: "2.0.0",
    description: "API v2 de Drivecord. Tout le contenu privé est chiffré de bout en bout : le serveur ne voit jamais ni noms, ni contenus, ni clés. Les clients chiffrent avec le format décrit dans SECURITY.md (AES-256-GCM par morceaux de 8 Mio).",
  },
  servers: [{ url: "https://drivecord.app/api/v2" }],
  security: [{ bearer: [] }],
  paths: {
    "/me": { get: op("Identité du jeton", "n'importe quel jeton valide", { responses: { 200: res("Me") } }) },
    "/uploads": {
      post: op("Ouvrir une session d'upload", "`app_folder:write` / `drive:write`", {
        parameters: [idem], requestBody: jsonBody("UploadCreate"), responses: { 201: res("UploadSession", "Session créée"), 409: err("Identifiant déjà utilisé ou drive non chiffré.") },
      }),
    },
    "/uploads/{uploadId}": {
      delete: op("Annuler un upload", "écriture", { parameters: [idParam("uploadId", "Identifiant de session")], responses: { 204: { description: "Annulé" } } }),
    },
    "/uploads/{uploadId}/chunks/{index}": {
      put: op("Envoyer un morceau (octet-stream)", "écriture", {
        parameters: [idParam("uploadId", "Session"), idParam("index", "Index du morceau (0…)"), { name: "X-Chunk-SHA256", in: "header", schema: { type: "string" }, description: "SHA-256 hexadécimal, vérifié si présent." }],
        requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
        responses: { 200: res("ChunkReceipt"), 400: err("Taille ou empreinte incorrecte (`chunk_mismatch`).") },
      }),
    },
    "/uploads/{uploadId}/complete": {
      post: op("Finaliser un upload", "écriture", {
        parameters: [idParam("uploadId", "Session"), idem], requestBody: jsonBody("UploadComplete"), responses: { 201: res("File", "Fichier créé"), 409: err("Morceaux manquants (`upload_incomplete`).") },
      }),
    },
    "/files": { get: op("Lister les fichiers", "lecture", { parameters: cursorParams, responses: { 200: res("FileList") } }) },
    "/files/{id}": {
      get: op("Lire un fichier", "lecture", { parameters: [idParam("id", "Identifiant")], responses: { 200: res("File"), 404: err("Introuvable.") } }),
      patch: op("Modifier (métadonnées chiffrées, déplacement, corbeille)", "écriture", { parameters: [idParam("id", "Identifiant")], requestBody: jsonBody("FilePatch"), responses: { 200: res("File") } }),
      delete: op("Mettre à la corbeille (ou supprimer avec `?permanent=true`)", "suppression", { parameters: [idParam("id", "Identifiant"), { name: "permanent", in: "query", schema: { type: "boolean" } }], responses: { 204: { description: "Supprimé" } } }),
    },
    "/files/{id}/chunks/{index}": {
      get: op("Télécharger un morceau (chiffré)", "lecture", {
        parameters: [idParam("id", "Identifiant"), idParam("index", "Index du morceau")],
        responses: { 200: { description: "Octets du morceau", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } } },
      }),
    },
    "/files/{id}/shares": {
      post: op("Créer un partage chiffré", "`drive:share` (jetons personnels)", { parameters: [idParam("id", "Identifiant"), idem], requestBody: jsonBody("ShareCreate"), responses: { 201: res("Share", "Partage créé") } }),
    },
    "/files/{id}/public": {
      post: op("Créer un lien public (fichiers `visibility: public`)", "`drive:share`", { parameters: [idParam("id", "Identifiant"), idem], responses: { 201: res("PublicLink", "Lien créé"), 409: err("Le fichier est chiffré.") } }),
      delete: op("Révoquer le lien public", "`drive:share`", { parameters: [idParam("id", "Identifiant")], responses: { 204: { description: "Révoqué" } } }),
    },
    "/shares/{token}": {
      get: op("Lire un partage", "`drive:share`", { parameters: [idParam("token", "Jeton de partage")], responses: { 200: res("Share") } }),
      delete: op("Révoquer un partage", "`drive:share`", { parameters: [idParam("token", "Jeton de partage")], responses: { 204: { description: "Révoqué" } } }),
    },
    "/folders": {
      get: op("Lister les dossiers", "lecture", { parameters: cursorParams, responses: { 200: res("FolderList") } }),
      post: op("Créer un dossier (nom chiffré)", "écriture", { parameters: [idem], requestBody: jsonBody("FolderCreate"), responses: { 201: res("Folder", "Dossier créé") } }),
    },
    "/folders/{id}": {
      get: op("Lire un dossier", "lecture", { parameters: [idParam("id", "Identifiant")], responses: { 200: res("Folder") } }),
      patch: op("Modifier un dossier", "écriture", { parameters: [idParam("id", "Identifiant")], requestBody: jsonBody("FolderPatch"), responses: { 200: res("Folder") } }),
      delete: op("Corbeille (ou suppression d'un dossier vide avec `?permanent=true`)", "suppression", { parameters: [idParam("id", "Identifiant"), { name: "permanent", in: "query", schema: { type: "boolean" } }], responses: { 204: { description: "Supprimé" } } }),
    },
    "/changes": {
      get: op("Journal des changements (jetons personnels)", "`drive:read`", { parameters: [{ name: "cursor", in: "query", schema: { type: "string", default: "0" } }, { name: "limit", in: "query", schema: { type: "integer", maximum: 500 } }], responses: { 200: res("ChangeList") } }),
    },
  },
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Jeton d'accès OAuth (`dvc_at_…`) ou jeton personnel (`dvc_pat_…`)." } },
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, requestId: { type: "string" } } } } },
      Me: { type: "object", properties: { principal: { type: "object" }, user: { type: "object", properties: { id: { type: "string" } } }, drive: { type: "object" }, limits: { type: "object" } } },
      UploadCreate: { type: "object", required: ["fileId", "size"], additionalProperties: false, properties: { fileId: { type: "string", pattern: "^[A-Za-z0-9_-]{21}$" }, parentId: { type: "string" }, size: { type: "integer", minimum: 1 }, visibility: { enum: ["private", "public"], default: "private" } } },
      UploadSession: { type: "object", properties: { uploadId: { type: "string" }, fileId: { type: "string" }, parentId: { type: "string" }, chunkSize: { type: "integer" }, chunkCount: { type: "integer" }, expiresAt: { type: "string", format: "date-time" } } },
      ChunkReceipt: { type: "object", properties: { index: { type: "integer" }, size: { type: "integer" }, sha256: { type: "string" } } },
      UploadComplete: { oneOf: [{ type: "object", required: ["encMeta", "fkWrapped", "noncePrefix"], additionalProperties: false, properties: { encMeta: { type: "string" }, fkWrapped: { type: "string" }, noncePrefix: { type: "string" } } }, { type: "object", required: ["filename"], additionalProperties: false, properties: { filename: { type: "string" }, mimeType: { type: "string" } } }] },
      File: { type: "object", properties: { id: { type: "string" }, parentId: { type: "string" }, visibility: { enum: ["private", "public"] }, size: { type: "integer" }, chunkSize: { type: "integer" }, chunkCount: { type: "integer" }, cryptoVersion: { type: "integer" }, encMeta: { type: ["string", "null"] }, fkWrapped: { type: ["string", "null"] }, noncePrefix: { type: ["string", "null"] }, filename: { type: "string" }, mimeType: { type: "string" }, trashed: { type: "boolean" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
      FileList: { type: "object", properties: { files: { type: "array", items: { $ref: "#/components/schemas/File" } }, nextCursor: { type: ["string", "null"] } } },
      FilePatch: { type: "object", additionalProperties: false, minProperties: 1, properties: { encMeta: { type: "string" }, parentId: { type: "string" }, trashed: { type: "boolean" } } },
      Folder: { type: "object", properties: { id: { type: "string" }, parentId: { type: "string" }, encName: { type: ["string", "null"] }, color: { type: ["string", "null"] }, trashed: { type: "boolean" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
      FolderList: { type: "object", properties: { folders: { type: "array", items: { $ref: "#/components/schemas/Folder" } }, nextCursor: { type: ["string", "null"] } } },
      FolderCreate: { type: "object", required: ["encName"], additionalProperties: false, properties: { parentId: { type: "string" }, encName: { type: "string" }, color: { type: ["string", "null"] } } },
      FolderPatch: { type: "object", additionalProperties: false, minProperties: 1, properties: { encName: { type: "string" }, parentId: { type: "string" }, color: { type: ["string", "null"] }, trashed: { type: "boolean" } } },
      ShareCreate: { type: "object", additionalProperties: false, properties: { token: { type: "string" }, expiresInDays: { type: ["integer", "null"] }, fkWrappedForShare: { type: "string" }, shareKdf: { type: "object" } } },
      Share: { type: "object", properties: { token: { type: "string" }, url: { type: "string" }, hasPassword: { type: "boolean" }, expiresAt: { type: ["string", "null"] } } },
      PublicLink: { type: "object", properties: { token: { type: "string" }, url: { type: "string" } } },
      ChangeList: { type: "object", properties: { changes: { type: "array", items: { type: "object", properties: { type: { enum: ["upsert", "delete"] }, kind: { enum: ["file", "folder"] }, id: { type: "string" }, at: { type: "string" } } } }, cursor: { type: "string" }, hasMore: { type: "boolean" } } },
    },
  },
};

fs.writeFileSync(new URL("../public/openapi-v2.json", import.meta.url), JSON.stringify(spec, null, 2) + "\n");
console.log("wrote public/openapi-v2.json");

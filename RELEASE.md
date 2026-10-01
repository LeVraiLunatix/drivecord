# Drivecord 1.0 — release checklist

Everything below was implemented and tested on branch `claude/zealous-cannon-wk2l14`
(Vitest: `npm test`; browser/API e2e in `e2e/`, run with `E2E_PROD=1 e2e/infra.sh up`).

## Before deploying
1. **Database** — apply the additive migrations (`prisma migrate deploy`): `20260930120000` → `20260930170500`.
2. **Env vars** (see `.env.example`):
   - `USERCONTENT_ORIGIN` — a separate domain that serves public files (see `docs/usercontent-domain.md`). Without it public links are served from the main origin.
   - `MAX_API_GIB_PER_DAY`, `MAX_API_FILES_PER_DRIVE` — optional quotas.
   - `INTERNAL_ORIGIN` — only if the public URL is not routable from inside the deployment (used by the proxy to read an app's embed origins).
3. **TLS terminator** must forward `X-Forwarded-Proto: https` (Auth.js secure cookies; embed token bridge).
4. **Packages** — `node packages/sdk/build.mjs` (prints the SRI hash) and `node packages/node/build.mjs`; publish `@drivecord/sdk` / `@drivecord/node` to npm when ready.

## Known limits to communicate
- The **Windows/Tauri client** cannot read E2EE files yet: it must adopt `src/lib/crypto/e2ee` (same code the web uses).
- iOS: device key lives in IndexedDB (no Keychain plugin yet).
- v1 API listing still exposes chunk references; v1 is deprecated (`Sunset: 30 Sep 2027`).
- In third-party iframes (SDK embeds) browsers partition storage: users may have to re-enter their recovery key/phrase inside the iframe.

## Phase 6 cleanup — only after you validate
Drop `Webhook.encKey`, the legacy chunk-finalize path and `src/lib/crypto/file-server-crypto.ts` once every drive is migrated (`e2eeVersion >= 1`).

## Done in this release (highlights)
- Real E2EE (names, folders, content), recovery key / passphrase / passkey / device approval, vault PIN never sent.
- OAuth 2.1 apps with folder confinement, API v2 (PAT + OAuth), OpenAPI spec, SDK + iframe embeds, Node SDK.
- /drive fixes: restore from trash (was missing), honest delete dialogs, stuck `pointer-events` after rename, drive-wide search, empty trash.
- Beta ended: banner removed, version 1.0.0, changelog.

# @drivecord/sdk

Browser SDK for [Drivecord](https://drivecord.app): OAuth 2.1 + PKCE sign-in, end-to-end encrypted
upload and viewer iframes, and a small API v2 client. Under 10 KB gzip, zero dependencies.

Files are encrypted inside the Drivecord iframe: this SDK and your site never see keys or file names.

## Install

```sh
npm i @drivecord/sdk
```

Or from a CDN, with Subresource Integrity (the hash is in `dist/drivecord.min.js.sri`):

```html
<script src="https://unpkg.com/@drivecord/sdk@1.0.1/dist/drivecord.min.js"
        integrity="sha384-…" crossorigin="anonymous"></script>
```

## Usage

Register an app in Drivecord first to get a `clientId` (`app_…`) and register your redirect URI
and the origins that may embed it.

```ts
import Drivecord from "@drivecord/sdk";

const dc = Drivecord.init({
  clientId: "app_xxxxxxxxxxxx",
  redirectUri: location.origin + "/cb",
});

// On the page served at redirectUri:
// Drivecord.completeSignIn();

await dc.signIn();                       // consent popup — call from a click handler

dc.mountUploader(document.getElementById("up")!, {
  accept: "image/*",
  onUploaded: ({ fileId, size }) => console.log(fileId, size),
});
dc.mountViewer(document.getElementById("view")!, { fileId });

const files = await dc.api("/files");    // API v2 with the app token (auto refresh)
```

## API

| | |
|---|---|
| `Drivecord.init({ clientId, redirectUri, baseUrl?, scopes? })` | Create a client. `baseUrl` defaults to `https://drivecord.app`; default scopes are `app_folder:read` and `app_folder:write`. |
| `Drivecord.completeSignIn()` | Call on the redirect page to finish the popup flow. |
| `dc.signedIn` | Whether the app holds a token. |
| `dc.signIn()` / `dc.signOut()` | Start or end the session. |
| `dc.api<T>(path, init?)` | Authenticated call to API v2. |
| `dc.mountUploader(el, options?)` | Mount the upload iframe. Options: `multiple`, `accept`, `onReady`, `onProgress`, `onUploaded`, `onError`. |
| `dc.mountViewer(el, { fileId, onError? })` | Mount the viewer iframe. |

Both `mount*` calls return `{ destroy(), iframe }`.

In third-party iframes some browsers partition storage, so users may have to re-enter their
recovery key inside the embed.

## License

MIT

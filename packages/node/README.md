# @drivecord/node

Server-side client for the [Drivecord](https://drivecord.app) API v2, using a personal access token.
Requires Node 20 or later.

Drivecord's servers only ever hold ciphertext, so you also need the **drive key** (32 raw bytes),
exported from Drivecord › Paramètres › Chiffrement. Encryption and decryption run in your process,
with the same code as the web app.

## Install

```sh
npm i @drivecord/node
```

## Usage

```ts
import DrivecordNode from "@drivecord/node";

const dc = new DrivecordNode({
  token: process.env.DRIVECORD_TOKEN!,      // dvc_pat_…
  driveKey,                                  // Uint8Array, 32 bytes
});

const { fileId } = await dc.upload({
  name: "report.pdf",
  type: "application/pdf",
  data: bytes,
});

const { files, nextCursor } = await dc.list({ limit: 50 });
const file = await dc.download(fileId);      // { name, type, data }
await dc.delete(fileId);                     // to the trash; { permanent: true } to erase
```

Keep the token and the drive key in environment variables or a secret manager, never in source code.

## API

| | |
|---|---|
| `new DrivecordNode({ token, driveKey, baseUrl? })` | `baseUrl` defaults to `https://drivecord.app`. Throws if `driveKey` is not 32 bytes. |
| `dc.me()` | The principal and whether the drive is encrypted. |
| `dc.upload({ name, type?, data, parentId? })` | Encrypt and upload. Resolves with `{ fileId }`. |
| `dc.list({ parentId?, cursor?, limit? })` | Page of files with decrypted `name`, `type` and `plainSize`; `nextCursor` is `null` on the last page. |
| `dc.download(fileId)` | Download and decrypt. |
| `dc.delete(fileId, { permanent? })` | Trash a file, or erase it for good. |

Failed calls throw `DrivecordError` with `status` and an optional `code`.

## License

MIT

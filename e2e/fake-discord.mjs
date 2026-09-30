/**
 * A tiny in-memory stand-in for Discord's webhook API + CDN, wired into a Playwright context, so the
 * real browser code (chunking, encryption, upload, download) runs end to end without any network.
 */
import crypto from "node:crypto";

const snowflake = () => "1" + String(crypto.randomBytes(6).readUIntBE(0, 6)).padStart(17, "0");

export function parseMultipart(buf, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  const delim = Buffer.from("--" + (boundary[1] ?? boundary[2]));
  const parts = [];
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    const next = buf.indexOf(delim, pos + delim.length);
    if (next === -1) break;
    const raw = buf.subarray(pos + delim.length + 2, next - 2); // skip CRLF after delimiter / before next
    const headerEnd = raw.indexOf("\r\n\r\n");
    const headers = raw.subarray(0, headerEnd).toString();
    parts.push({
      name: /name="([^"]*)"/.exec(headers)?.[1],
      filename: /filename="([^"]*)"/.exec(headers)?.[1],
      body: raw.subarray(headerEnd + 4),
    });
    pos = next;
  }
  return parts;
}

export function createFakeDiscord() {
  const attachments = new Map(); // attachmentId -> { buf, filename }
  const messages = new Map(); // messageId -> message
  const log = []; // every upload: { filename, size }

  const messageFor = (id) => messages.get(id);

  async function install(context) {
    await context.route(/^https:\/\/discord\.com\/api\/v10\/webhooks\//, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const m = /\/webhooks\/(\d+)\/([^/?]+)(?:\/messages\/(\d+))?/.exec(url.pathname);
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

      if (m?.[3]) {
        if (req.method() === "DELETE") {
          messages.delete(m[3]);
          return route.fulfill({ status: 204, headers: cors });
        }
        const msg = messageFor(m[3]);
        return msg
          ? route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(msg) })
          : route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: JSON.stringify({ message: "Unknown Message", code: 10008 }) });
      }
      if (req.method() === "POST") {
        const parts = parseMultipart(req.postDataBuffer(), req.headers()["content-type"]);
        const file = parts.find((p) => p.name === "files[0]");
        const attId = snowflake();
        const msgId = snowflake();
        attachments.set(attId, { buf: Buffer.from(file.body), filename: file.filename });
        log.push({ filename: file.filename, size: file.body.length });
        const message = {
          id: msgId,
          channel_id: "111111111111111111",
          timestamp: new Date().toISOString(),
          attachments: [
            {
              id: attId,
              filename: file.filename,
              size: file.body.length,
              url: `https://cdn.discordapp.com/attachments/1/${attId}/${encodeURIComponent(file.filename)}?ex=ffffffff&is=1&hm=2`,
              proxy_url: "",
            },
          ],
        };
        messages.set(msgId, message);
        return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(message) });
      }
      // GET /webhooks/<id>/<token> → webhook info
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({ id: m[1], type: 1, name: "E2E Hook", channel_id: "111111111111111111", guild_id: "222222222222222222", token: m[2], avatar: null, application_id: null }),
      });
    });

    // The app streams CDN bytes through its same-origin proxy.
    await context.route("**/api/proxy?**", async (route) => {
      const u = new URL(route.request().url()).searchParams.get("u");
      const att = /\/attachments\/1\/(\d+)\//.exec(u ?? "");
      const hit = att && attachments.get(att[1]);
      if (!hit) return route.fulfill({ status: 404, body: "gone" });
      return route.fulfill({ status: 200, contentType: "application/octet-stream", body: hit.buf });
    });
  }

  return { install, attachments, messages, log };
}

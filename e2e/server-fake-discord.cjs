/**
 * Preloaded into the dev server (NODE_OPTIONS=--require) so its server-side fetches to Discord
 * hit an in-memory fake instead of the network. Test infrastructure only.
 */
const crypto = require("node:crypto");
const real = globalThis.fetch;
const store = (globalThis.__fakeDiscord ??= { att: new Map(), msg: new Map(), log: [] });
const snow = () => "1" + String(crypto.randomBytes(6).readUIntBE(0, 6)).padStart(17, "0");
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init.method ?? "GET").toUpperCase();
  if (url.hostname === "discord.com" && url.pathname.startsWith("/api/v10/webhooks/")) {
    const m = /\/webhooks\/(\d+)\/([^/?]+)(?:\/messages\/(\d+))?/.exec(url.pathname);
    if (m[3]) {
      if (method === "DELETE") { store.msg.delete(m[3]); return new Response(null, { status: 204 }); }
      const msg = store.msg.get(m[3]);
      return msg ? json(200, msg) : json(404, { message: "Unknown Message", code: 10008 });
    }
    if (method === "POST") {
      const file = init.body.get("files[0]");
      const buf = Buffer.from(await file.arrayBuffer());
      const attId = snow(), msgId = snow();
      const ex = Math.floor(Date.now() / 1000 + 86400).toString(16);
      const cdn = `https://cdn.discordapp.com/attachments/1/${attId}/${encodeURIComponent(file.name)}?ex=${ex}&is=aa&hm=bb`;
      store.att.set(attId, buf);
      const msg = { id: msgId, attachments: [{ id: attId, url: cdn, size: buf.length, filename: file.name }] };
      store.msg.set(msgId, msg);
      store.log.push({ filename: file.name, size: buf.length });
      return json(200, msg);
    }
    return json(404, {});
  }
  if (url.hostname === "cdn.discordapp.com") {
    const attId = url.pathname.split("/")[3];
    const buf = store.att.get(attId);
    return buf ? new Response(buf, { status: 200 }) : new Response(null, { status: 404 });
  }
  return real(input, init);
};

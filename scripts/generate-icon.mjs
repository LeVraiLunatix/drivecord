// Génère une icône Drivecord 1024×1024 PNG sans dépendance externe.
// Dégradé indigo→violet→fuchsia + nuage avec flèche upload.
// Usage: node scripts/generate-icon.mjs [outputPath]
import zlib from "node:zlib";
import fs from "node:fs";

const W = 1024, H = 1024, RADIUS = 230;
const out = process.argv[2] || "resources/icon.png";

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function inRounded(x, y, r) {
  const cx = Math.min(Math.max(x, r), W - r);
  const cy = Math.min(Math.max(y, r), H - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function cloudMask(px, py) {
  const nx = (px - W / 2) / (W * 0.30);
  const ny = (py - H / 2) / (H * 0.30);
  const circle = (cx, cy, r) => (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
  const rect = (x0, y0, x1, y1) => nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1;

  const cloud =
    circle(-0.45, 0.10, 0.40) ||
    circle(0.45, -0.05, 0.46) ||
    circle(0.0, -0.30, 0.52) ||
    rect(-0.72, 0.18, 0.90, 0.55);

  const arrowShaft = rect(-0.10, -0.12, 0.10, 0.50);
  const arrowHead = ny < -0.08 && Math.abs(nx) < -(ny + 0.08) * 0.95 + 0.36;
  const arrow = arrowShaft || arrowHead;

  return { cloud: cloud && !arrow, arrow: arrow && cloud };
}

// Build RGBA rows
const raw = Buffer.alloc(H * (1 + W * 4));
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0; // filter byte
  for (let x = 0; x < W; x++) {
    const t = (x / W) * 0.5 + (y / H) * 0.5;
    let r, g, b;
    if (t < 0.5) {
      const u = t * 2;
      r = lerp(99, 139, u); g = lerp(102, 92, u); b = lerp(241, 246, u);
    } else {
      const u = (t - 0.5) * 2;
      r = lerp(139, 217, u); g = lerp(92, 70, u); b = lerp(246, 239, u);
    }
    let a = 255;

    if (!inRounded(x, y, RADIUS)) {
      r = g = b = a = 0;
    } else {
      const { cloud, arrow } = cloudMask(x, y);
      if (cloud) { r = lerp(r, 255, 0.93); g = lerp(g, 255, 0.93); b = lerp(b, 255, 0.93); }
      if (arrow) { r = lerp(r, 40, 0.6); g = lerp(g, 25, 0.6); b = lerp(b, 95, 0.6); }
    }
    raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(Buffer.concat([tb, data])) >>> 0 : crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crc]);
}

// CRC32 fallback (Node <22 lacks zlib.crc32)
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.mkdirSync(out.substring(0, out.lastIndexOf("/")) || ".", { recursive: true });
fs.writeFileSync(out, png);
console.log(`✅ ${out} (${Math.round(png.length / 1024)} KB)`);

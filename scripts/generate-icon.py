"""
Génère resources/icon.png (1024×1024) — icon Drivecord.
Dégradé indigo→violet→fuchsia avec un nuage au centre.
Lance avec : python scripts/generate-icon.py
"""
import math, struct, zlib, os

W = H = 1024
RADIUS = 180  # coins arrondis

def lerp(a, b, t):
    return int(a + (b - a) * t)

def in_rounded_rect(x, y, r):
    cx = min(max(x, r), W - r)
    cy = min(max(y, r), H - r)
    return math.hypot(x - cx, y - cy) <= r

# --- Cloud upload path (simplified SVG-like pixel art) ---
def cloud_mask(px, py):
    # Normalize to [-1, 1] space
    nx = (px - W/2) / (W * 0.28)
    ny = (py - H/2) / (H * 0.28)

    # Main cloud body (two bumps + base)
    def circle(cx, cy, r):
        return (nx - cx)**2 + (ny - cy)**2 < r**2

    def rect(x0, y0, x1, y1):
        return x0 <= nx <= x1 and y0 <= ny <= y1

    cloud = (
        circle(-0.45, 0.05, 0.42) or   # left bump
        circle(0.45, -0.1, 0.5) or    # right bump
        circle(0.0, -0.3, 0.55) or    # top centre bump
        rect(-0.75, 0.15, 0.95, 0.6)  # base
    )

    # Arrow up (upload) inside cloud
    arrow = (
        rect(-0.12, -0.15, 0.12, 0.55) or   # shaft
        (                                     # arrowhead triangle
            ny < -0.1 and
            abs(nx) < -(ny + 0.1) * 0.9 + 0.42
        )
    )

    return cloud and not arrow, arrow and cloud

# ---- PNG encode ----
rows = []
for y in range(H):
    row = bytearray()
    for x in range(W):
        t = x / W * 0.5 + y / H * 0.5  # diagonal gradient

        # Background gradient: #6366f1 → #8b5cf6 → #d946ef
        if t < 0.5:
            r = lerp(99,  139, t*2)
            g = lerp(102,  92, t*2)
            b = lerp(241, 246, t*2)
        else:
            r = lerp(139, 217, (t-0.5)*2)
            g = lerp( 92,  70, (t-0.5)*2)
            b = lerp(246, 239, (t-0.5)*2)

        alpha = 255

        if not in_rounded_rect(x, y, RADIUS):
            r = g = b = alpha = 0
        else:
            is_cloud, is_arrow = cloud_mask(x, y)
            if is_cloud:
                # semi-transparent white cloud
                blend = 0.92
                r = lerp(r, 255, blend)
                g = lerp(g, 255, blend)
                b = lerp(b, 255, blend)
            if is_arrow:
                # gradient-coloured arrow (darker)
                blend = 0.55
                r = lerp(r, 30, blend)
                g = lerp(g, 20, blend)
                b = lerp(b, 80, blend)

        row += bytes([r, g, b, alpha])
    rows.append(row)

def make_png(rows, w, h):
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    # RGBA = color type 6
    ihdr = chunk(b'IHDR', struct.pack('>II', w, h) + bytes([8, 6, 0, 0, 0]))

    raw = b''
    for row in rows:
        raw += b'\x00' + bytes(row)
    idat = chunk(b'IDAT', zlib.compress(raw, 6))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

os.makedirs('resources', exist_ok=True)
png = make_png(rows, W, H)
with open('resources/icon.png', 'wb') as f:
    f.write(png)

print(f"✅ resources/icon.png generated ({len(png)//1024} KB)")

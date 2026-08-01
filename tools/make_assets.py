#!/usr/bin/env python3
"""ProjectPro asset generator: app icons (any/maskable/apple-touch) and
iOS splash screens, built from assets/icon-src.png. Re-runnable:
    python3 tools/make_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'icon-src.png')
ICON_DIR = os.path.join(ROOT, 'assets', 'icons')
SPLASH_DIR = os.path.join(ROOT, 'assets', 'splash')
BRAND = '#6750A4'
DARK_BG = '#141218'

os.makedirs(ICON_DIR, exist_ok=True)
os.makedirs(SPLASH_DIR, exist_ok=True)

src = Image.open(SRC).convert('RGBA')
# trim transparent border and make square
bbox = src.getbbox()
if bbox:
    src = src.crop(bbox)
w, h = src.size
side = min(w, h)
src = src.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))


def rounded(im, radius_ratio=0.22):
    size = im.size[0]
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size, size], radius=int(size * radius_ratio), fill=255)
    out = im.copy()
    out.putalpha(mask)
    return out


def save_icon(size, name, maskable=False, opaque_bg=None):
    canvas = Image.new('RGB' if opaque_bg else 'RGBA', (size, size), opaque_bg or (0, 0, 0, 0))
    if maskable:
        # keep content inside the 80% safe zone
        inner = int(size * 0.78)
        icon = src.resize((inner, inner), Image.LANCZOS)
        canvas.paste(icon, ((size - inner) // 2, (size - inner) // 2), icon)
        canvas.save(os.path.join(ICON_DIR, name))
    elif opaque_bg:
        inner = int(size * 0.92)
        icon = rounded(src.resize((inner, inner), Image.LANCZOS))
        canvas.paste(icon, ((size - inner) // 2, (size - inner) // 2), icon)
        canvas.save(os.path.join(ICON_DIR, name))
    else:
        canvas = rounded(src.resize((size, size), Image.LANCZOS))
        canvas.save(os.path.join(ICON_DIR, name))
    print('wrote', name)


save_icon(192, 'icon-192.png')
save_icon(512, 'icon-512.png')
save_icon(192, 'icon-maskable-192.png', maskable=True, opaque_bg=BRAND)
save_icon(512, 'icon-maskable-512.png', maskable=True, opaque_bg=BRAND)
save_icon(180, 'apple-touch-icon.png', opaque_bg=BRAND)

# --- iOS splash screens (pixel sizes referenced from index.html) ---
SPLASHES = [(640, 1136), (750, 1334), (828, 1792), (1125, 2436),
            (1170, 2532), (1284, 2778), (1536, 2048), (2048, 2732)]


def font(size, bold=True):
    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


for wd, hg in SPLASHES:
    im = Image.new('RGB', (wd, hg), BRAND)
    # subtle darker band at bottom for depth
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(hg * 0.82), wd, hg], fill='#5A4595')
    dsize = int(min(wd, hg) * 0.26)
    icon = rounded(src.resize((dsize, dsize), Image.LANCZOS))
    im.paste(icon, ((wd - dsize) // 2, int(hg * 0.32) - dsize // 2), icon)
    f1 = font(int(min(wd, hg) * 0.055))
    f2 = font(int(min(wd, hg) * 0.024), bold=False)
    title = 'ProjectPro'
    sub = 'Estimating & Job Management'
    tw = d.textlength(title, font=f1)
    sw_ = d.textlength(sub, font=f2)
    d.text(((wd - tw) / 2, int(hg * 0.32) + dsize // 2 + int(hg * 0.02)), title, font=f1, fill='#FFFFFF')
    d.text(((wd - sw_) / 2, int(hg * 0.32) + dsize // 2 + int(hg * 0.02) + int(min(wd, hg) * 0.075)), sub, font=f2, fill='#EADDFF')
    im.save(os.path.join(SPLASH_DIR, f'splash-{wd}x{hg}.png'))
    print('wrote splash', f'{wd}x{hg}')

print('Assets complete.')

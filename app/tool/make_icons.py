import json
import shutil
from pathlib import Path

from PIL import Image

APP = Path(__file__).resolve().parent.parent
SRC = APP.parent / "logoSiagaku.png"
RES = APP / "android" / "app" / "src" / "main" / "res"
WEB = APP / "web"
BUILT = APP.parent / "frontend" / "public" / "app"
WHITE = (255, 255, 255, 255)

logo = Image.open(SRC).convert("RGBA")
logo = logo.crop(logo.getbbox())


def fit(size, scale, bg=None):
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    box = int(size * scale)
    w, h = logo.size
    r = box / max(w, h)
    im = logo.resize((max(1, round(w * r)), max(1, round(h * r))), Image.LANCZOS)
    canvas.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return canvas


def rounded(size, scale):
    from PIL import ImageDraw

    base = fit(size, scale, WHITE)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out


def silhouette(size):
    im = fit(size, 0.92)
    alpha = im.getchannel("A")
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


launcher = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for d, px in launcher.items():
    folder = RES / f"mipmap-{d}"
    folder.mkdir(parents=True, exist_ok=True)
    rounded(px, 0.78).save(folder / "ic_launcher.png", optimize=True)
    fit(px * 9 // 4, 0.5).save(folder / "ic_launcher_foreground.png", optimize=True)
    dr = RES / f"drawable-{d}"
    dr.mkdir(parents=True, exist_ok=True)
    silhouette(px // 2).save(dr / "ic_stat_siagaku.png", optimize=True)
    fit(px * 2, 0.9).save(dr / "splash_logo.png", optimize=True)

(APP / "assets" / "images").mkdir(parents=True, exist_ok=True)
fit(512, 1.0).save(APP / "assets" / "images" / "logo.png", optimize=True)

(WEB / "icons").mkdir(parents=True, exist_ok=True)
fit(64, 0.94).save(WEB / "favicon.png", optimize=True)
for px in (192, 512):
    fit(px, 0.86, WHITE).save(WEB / "icons" / f"Icon-{px}.png", optimize=True)
    fit(px, 0.62, WHITE).save(WEB / "icons" / f"Icon-maskable-{px}.png", optimize=True)

manifest_path = WEB / "manifest.json"
m = json.loads(manifest_path.read_text(encoding="utf-8"))
m.update(name="SiagaKu", short_name="SiagaKu", background_color="#FFFFFF", theme_color="#1E4E7E",
         description="SiagaKu - aplikasi warga untuk laporan darurat (SOS) dan laporan kejadian.")
manifest_path.write_text(json.dumps(m, indent=4) + "\n", encoding="utf-8")

ico = APP / "windows" / "runner" / "resources" / "app_icon.ico"
if ico.parent.exists():
    fit(256, 0.94).save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

if BUILT.exists():
    shutil.copy2(WEB / "favicon.png", BUILT / "favicon.png")
    shutil.copy2(manifest_path, BUILT / "manifest.json")
    (BUILT / "icons").mkdir(exist_ok=True)
    for f in (WEB / "icons").glob("*.png"):
        shutil.copy2(f, BUILT / "icons" / f.name)

print("ok", logo.size)

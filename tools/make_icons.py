"""Generate PWA icons: dark background, cyan globe, gold dot."""
import os

from PIL import Image, ImageDraw

SIZE = 512
BG = (7, 11, 20)
EXPLORE = (56, 189, 248)
JOURNEY = (251, 191, 36)


def main():
    for size in (192, 512):
        s = size
        img = Image.new("RGB", (s, s), BG)
        d = ImageDraw.Draw(img)
        m = s // 2
        r = int(s * 0.36)

        glow = Image.new("RGB", (s, s), BG)
        gd = ImageDraw.Draw(glow)
        gd.ellipse([m - r * 1.5, m - r * 1.5, m + r * 1.5, m + r * 1.5],
                   fill=tuple(int(c * 0.25 + 259 // 300) for c in EXPLORE))
        glow = Image.new("RGB", (s, s), tuple(int(c * 0.18 + BG[i] * 0.25) for i, c in enumerate(EXPLORE)))
        mask = Image.new("L", (s, s), 0)
        md = ImageDraw.Draw(mask)
        md.ellipse([m - r * 135 // 100, m - r * 135 // 100, m + r * 135 // 100, m + r * 135 // 100], fill=70)
        img = Image.composite(glow, img, mask)
        d = ImageDraw.Draw(img)

        d.ellipse([m - r, m - r, m + r, m + r], fill=(11, 18, 32), outline=EXPLORE, width=max(2, s // 100))
        for k in range(1, 4):
            ell = r * k // 3
            d.ellipse([m - ell, m - ell * 55 // 100, m + ell, m + ell * 55 // 100], outline=(36, 48, 77), width=1)
            d.ellipse([m - ell * 55 // 100, m - ell, m + ell * 55 // 100, m + ell], outline=(36, 48, 77), width=1)

        px, py = int(m + r * 0.25), int(m - r * 0.25)
        pr = max(2, s // 70)
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=JOURNEY)

        out = os.path.join("web", "icons", f"icon-{size}.png")
        img.resize((size, size)).save(out)
        print("wrote", out)


if __name__ == "__main__":
    main()

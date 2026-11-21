"""Fetch the graphics packs: lucide icons + country flag SVGs (4x3)."""
import os
import urllib.request

ICONS = {
    "globe": "globe", "landmark": "landmark", "bookmark": "bookmark", "user": "user",
    "sun": "sun", "calendar-days": "calendar-days", "scan-line": "scan-line",
    "file-text": "file-text", "log-in": "log-in", "user-plus": "user-plus",
    "upload": "upload", "id-card": "id-card", "chevron-down": "chevron-down",
    "camera": "camera", "plus": "plus", "x": "x", "trash-2": "trash-2",
    "triangle-alert": "triangle-alert", "check": "check", "arrow-right": "arrow-right",
    "sparkles": "sparkles", "shield-check": "shield-check", "log-out": "log-out",
    "info": "info", "link": "link", "eye": "eye", "arrow-left": "arrow-left",
    "map": "map", "moon": "moon", "bookmark": "bookmark", "activity": "activity",
    "house": "house", "external-link": "external-link", "clock": "clock",
}

FLAGS = ["at", "pt", "be", "lv", "ro", "nl", "de", "fi", "hu", "fr", "it", "pl", "se"]

LUCIDE = "https://cdn.jsdelivr.net/npm/lucide-static@0.525.0/icons/{name}.svg"
FLAGS_URL = "https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3/{code}.svg"


def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read()


def main():
    os.makedirs("web/icons/lucide", exist_ok=True)
    os.makedirs("web/icons/flags", exist_ok=True)
    for fname, name in ICONS.items():
        out = f"web/icons/lucide/{fname}.svg"
        svg = fetch(LUCIDE.format(name=name))
        open(out, "wb").write(svg)
        print("icon", fname, len(svg), "bytes")
    for code in FLAGS:
        out = f"web/icons/flags/{code}.svg"
        svg = fetch(FLAGS_URL.format(code=code))
        open(out, "wb").write(svg)
        print("flag", code, len(svg), "bytes")


if __name__ == "__main__":
    main()

"""Generate web/js/icons.js embedding the lucide SVGs inline (no runtime fetch)."""
import json
import os
import re

SRC_DIR = "web/icons/lucide"
OUT = "web/js/icons.js"


def main():
    icons = {}
    for fname in sorted(os.listdir(SRC_DIR)):
        if not fname.endswith(".svg"):
            continue
        name = fname[: -len(".svg")]
        svg = open(os.path.join(SRC_DIR, fname), encoding="utf-8").read()
        svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
        svg = re.sub(r">\s+<", "><", svg.strip())
        icons[name] = svg

    js = (
        "/* icons.js - lucide graphics pack, inlined at build time (tools/make_icons_js.py). */\n"
        "const ICONS = " + json.dumps(icons, separators=(",", ":")) + ";\n\n"
        "function icon(name, cls) {\n"
        "  if (!ICONS[name]) return '';\n"
        "  return ICONS[name].replace('class=\"', 'class=\"icon ' + (cls || '') + ' ');\n"
        "}\n\n"
        "function flagImg(code, cls) {\n"
        "  if (!code || code.length !== 2) return '';\n"
        "  return '<img class=\"flag ' + (cls || '') + '\" src=\"/icons/flags/' + code.toLowerCase() + '.svg\" alt=\"\" loading=\"lazy\"/>';\n"
        "}\n"
    )
    open(OUT, "w", encoding="utf-8").write(js)
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB,", len(icons), "icons")


if __name__ == "__main__":
    main()

"""Convert Natural Earth 110m TopoJSON into a compact GeoJSON for the canvas globe.

Input: world-atlas countries-110m.json (quantized TopoJSON).
Output: web/data/countries-110m.geojson with 1-decimal coordinates and a
        minimal property set, to stay small and cache-friendly on device.
"""
import json
import sys
import urllib.request

SRC = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
OUT = "web/data/countries-110m.geojson"
SKIP = {"Antarctica"}


def decode_arc(arc, tx):
    scale = tx["scale"]
    translate = tx["translate"]
    x, y = 0, 0
    pts = []
    for dx, dy in arc:
        x += dx
        y += dy
        lon = x * scale[0] + translate[0]
        lat = y * scale[1] + translate[1]
        pts.append((round(lon, 1), round(lat, 1)))
    return pts


def main():
    print(f"fetching {SRC}")
    with urllib.request.urlopen(SRC, timeout=60) as r:
        topo = json.load(r)

    arcs = [decode_arc(a, topo["transform"]) for a in topo["arcs"]]

    def ring(arc_ids):
        pts = []
        for aid in arc_ids:
            seg = arcs[aid] if aid >= 0 else arcs[~aid][::-1]
            if pts and pts[-1] == seg[0]:
                pts.extend(seg[1:])
            else:
                pts.extend(seg)
        return [[x, y] for x, y in pts]

    features = []
    for geom in topo["objects"]["countries"]["geometries"]:
        name = geom["properties"]["name"]
        if name in SKIP:
            continue
        pgons = []
        if geom["type"] == "Polygon":
            pgons = [[ring(r) for r in geom["arcs"]]]
        elif geom["type"] == "MultiPolygon":
            pgons = [[ring(r) for r in poly] for poly in geom["arcs"]]
        if not pgons:
            continue
        features.append({
            "type": "Feature",
            "id": geom.get("id"),
            "properties": {"name": name},
            "geometry": {"type": "MultiPolygon", "coordinates": pgons},
        })

    out = {"type": "FeatureCollection", "features": features}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))

    import os
    print(f"wrote {OUT}: {os.path.getsize(OUT) / 1024:.0f} KB, {len(features)} countries")


if __name__ == "__main__":
    sys.exit(main())

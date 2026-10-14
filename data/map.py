"""Build data/map.json: electorate outlines for the map view, small enough to embed in the page.

    python3 data/map.py   # only after replacing the files in data/boundaries/

Needs shapely and pyproj (pip install shapely pyproj); the page itself needs neither.

Sources, both in data/boundaries/:
- general-2026.geojson, maori-2026.geojson: Stats NZ General and Māori Electorates 2025, the
  boundaries for the 2026 election (CC BY 4.0), via github.com/bradleyscott/election-night.
  They run out to sea, so each one is clipped to the coastline below.
- land-2193.geojson: LINZ NZ Coastlines and Islands Polygons (Topo 1:50k) (CC BY 3.0 NZ),
  simplified to 40 m and stored in NZTM (EPSG:2193). To rebuild it from LINZ's shapefile
  (pip install pyshp): python3 data/map.py --land path/to/nz-coastlines-and-islands-polygons-topo-150k.shp

Everything is drawn in NZTM metres divided by UNIT, so 1 map unit is 50 m, with y pointing down.
"""
import json, os, sys
import numpy as np
import shapely
from shapely.geometry import shape, mapping, box
from shapely.ops import polylabel
from pyproj import Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, "boundaries")
UNIT = 50                                # metres per map unit
MAINLAND = box(1050000, 4700000, 2150000, 6250000)  # NZTM extent of the three main islands; leaves out the Chathams
TOL = 400                                # simplification tolerance (Visvalingam–Whyatt; roughly metres)
MIN_PART = 1.5e6                         # drop islands under 1.5 km²
RENAME = {"Mt Albert": "Mount Albert", "Mt Roskill": "Mount Roskill", "Mt Maunganui": "Mount Maunganui"}
# quick-zoom areas: (label, west, north, east, south) in degrees
REGIONS = [("Auckland", 174.45, -36.62, 175.15, -37.12), ("Hamilton and Tauranga", 174.95, -37.45, 176.45, -38.05),
           ("Wellington", 174.6, -40.82, 175.2, -41.4), ("Christchurch", 172.3, -43.38, 172.85, -43.68),
           ("Dunedin", 170.15, -45.75, 170.75, -46.0)]
TO_NZTM = Transformer.from_crs(4326, 2193, always_xy=True)


def build_land(shp):
    import shapefile
    parts = []
    for s in shapefile.Reader(shp).shapes():
        g = shape(s.__geo_interface__)
        if g.area >= 5e5 and g.intersects(MAINLAND):
            parts.append(g.simplify(40))
    land = shapely.make_valid(shapely.union_all(parts))
    land = shapely.set_precision(land, 1)
    json.dump({"type": "Feature", "properties": {"source": "LINZ NZ Coastlines and Islands Polygons (Topo 1:50k), CC BY 3.0 NZ"},
               "geometry": mapping(land)}, open(os.path.join(B, "land-2193.geojson"), "w"), separators=(",", ":"))
    print("wrote land-2193.geojson")


def to_nztm(geom):
    return shapely.transform(geom, lambda c: np.column_stack(TO_NZTM.transform(c[:, 0], c[:, 1])))


def load(fname, land):
    feats = json.load(open(os.path.join(B, fname), encoding="utf-8"))["features"]
    names, geoms = [], []
    for f in feats:
        g = to_nztm(shapely.make_valid(shape(f["geometry"]))).intersection(land)
        g = shapely.unary_union([p for p in getattr(g, "geoms", [g]) if p.geom_type == "Polygon" and p.area >= MIN_PART])
        names.append(RENAME.get(f["properties"]["name"], f["properties"]["name"])); geoms.append(g)
    # simplify shared borders together so neighbouring electorates still meet exactly
    geoms = list(shapely.coverage_simplify(geoms, TOL, simplify_boundary=True))
    return names, geoms


def xy(x, y, top, left):
    return round((x - left) / UNIT), round((top - y) / UNIT)


def ring_path(coords, top, left):
    q = [xy(x, y, top, left) for x, y in coords[:-1]]
    q = [p for i, p in enumerate(q) if i == 0 or p != q[i - 1]]
    if len(q) < 3: return ""
    s = f"M{q[0][0]} {q[0][1]}l" + " ".join(f"{q[i][0]-q[i-1][0]} {q[i][1]-q[i-1][1]}" for i in range(1, len(q)))
    return s.replace(" -", "-") + "z"


def export(names, geoms, top, left):
    out = []
    for n, g in zip(names, geoms):
        polys = list(getattr(g, "geoms", [g]))
        d = "".join(ring_path(r.coords, top, left) for p in polys for r in [p.exterior, *p.interiors])
        lp = polylabel(max(polys, key=lambda p: p.area), tolerance=200)
        x0, y0, x1, y1 = g.bounds
        out.append({"n": n, "d": d, "l": list(xy(lp.x, lp.y, top, left)), "b": [*xy(x0, y1, top, left), *xy(x1, y0, top, left)]})
    return out


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--land":
        build_land(sys.argv[2])
    land = shape(json.load(open(os.path.join(B, "land-2193.geojson")))["geometry"])
    land = land.intersection(MAINLAND)
    gn, gg = load("general-2026.geojson", land)
    mn, mg = load("maori-2026.geojson", land)
    x0, y0, x1, y1 = shapely.union_all(gg).bounds
    left, top = x0, y1
    seats = {s["n"] for s in json.load(open(os.path.join(HERE, "data.json"), encoding="utf-8"))["seats"]}
    assert set(gn + mn) == seats, ("boundary names don't match data.json", seats - set(gn + mn), set(gn + mn) - seats)
    regions = []
    for label, w, n, e, s in REGIONS:
        (ax, ay), (bx, by) = TO_NZTM.transform(w, n), TO_NZTM.transform(e, s)
        regions.append({"n": label, "b": [*xy(ax, ay, top, left), *xy(bx, by, top, left)]})
    data = {"general": export(gn, gg, top, left), "maori": export(mn, mg, top, left),
            "box": [0, 0, round((x1 - x0) / UNIT), round((y1 - y0) / UNIT)], "regions": regions,
            "source": "Electorate boundaries: Stats NZ (CC BY 4.0). Coastline: LINZ (CC BY 3.0 NZ)"}
    p = os.path.join(HERE, "map.json")
    json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"ok: {len(gn)} general + {len(mn)} Māori electorates, {os.path.getsize(p) // 1024} KB")


if __name__ == "__main__":
    main()

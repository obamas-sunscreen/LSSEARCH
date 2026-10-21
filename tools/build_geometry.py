"""Rebuild data/us-states.json from the us-atlas TopoJSON (Census boundaries, 1:10m).

    curl -L -o states-10m.json https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json
    python3 tools/build_geometry.py states-10m.json

Output is {state name: [ring, ...]} with each ring a list of [lon, lat]. Alaska
and Hawaii are moved into insets below the lower 48. Hawaii's move has to match
HI_REAL / HI_INSET in app.js exactly, because the app puts Honolulu's pin through
the same transform.
"""
import json
import math
import sys

HI_REAL = [-160.25, 18.91, -154.81, 22.24]     # main islands; the northwest chain is dropped
HI_INSET = [-104.734, 19.6, -98.264, 23.412]
AK_REAL = [-187.5401, 51.2291, -129.9812, 71.3526]   # Aleutians unwrapped past -180
AK_INSET = [-124.234, 19.0, -107.295, 31.246]
SKIP = {"American Samoa", "Guam", "Commonwealth of the Northern Mariana Islands",
        "Puerto Rico", "United States Virgin Islands"}
TOLERANCE = 0.006                              # degrees, Douglas-Peucker; well under a pixel at full zoom
MIN_AREA = 0.0004                              # square degrees; drops specks of island


def decode_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append([x * sx + tx, y * sy + ty])
        arcs.append(pts)
    return arcs


def ring_points(ring, arcs):
    out = []
    for i in ring:
        pts = arcs[i] if i >= 0 else arcs[~i][::-1]
        out.extend(pts if not out else pts[1:])
    return out


def simplify(pts, tol):
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        best, idx = 0, None
        for i in range(a + 1, b):
            # A closed ring starts and ends on one point: measure from it instead.
            d = (abs(dy * (pts[i][0] - x1) - dx * (pts[i][1] - y1)) / norm if norm
                 else math.hypot(pts[i][0] - x1, pts[i][1] - y1))
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def area(pts):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2


def bbox(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return [min(xs), min(ys), max(xs), max(ys)]


def move(rings, src, dst):
    fx = (dst[2] - dst[0]) / (src[2] - src[0])
    fy = (dst[3] - dst[1]) / (src[3] - src[1])
    return [[[dst[0] + (x - src[0]) * fx, dst[1] + (y - src[1]) * fy] for x, y in r] for r in rings]


def main(path):
    topo = json.load(open(path))
    arcs = decode_arcs(topo)
    out = {}
    for geom in topo["objects"]["states"]["geometries"]:
        name = geom["properties"]["name"]
        if name in SKIP:
            continue
        polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        rings = [ring_points(r, arcs) for poly in polys for r in poly]
        if name == "Alaska":
            # The Aleutians cross the antimeridian; bring them back to the west.
            rings = [[[x - 360 if x > 0 else x, y] for x, y in r] for r in rings]
        if name == "Hawaii":
            rings = [r for r in rings if HI_REAL[0] - 0.3 <= bbox([r])[0]]
        rings = [simplify(r, TOLERANCE) for r in rings]
        rings = [r for r in rings if len(r) >= 4 and area(r) >= MIN_AREA] or rings[:1]
        if name == "Alaska":
            rings = move(rings, AK_REAL, AK_INSET)
        elif name == "Hawaii":
            rings = move(rings, HI_REAL, HI_INSET)
        # TopoJSON rings repeat their first point at the end; the app closes them with Z.
        out[name] = [[[round(x, 3), round(y, 3)] for x, y in (r[:-1] if r[0] == r[-1] else r)]
                     for r in rings]
    json.dump(out, open("data/us-states.json", "w"), separators=(",", ":"))
    print(f"{len(out)} states, {sum(len(r) for v in out.values() for r in v)} points")


if __name__ == "__main__":
    main(sys.argv[1])

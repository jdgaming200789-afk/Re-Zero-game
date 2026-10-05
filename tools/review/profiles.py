"""Orthographic profiles of a character GLB's body (bpy):
side profile at the midline and through the bust, front half-width of the
torso, inner-thigh line. Overlays several GLBs in one PNG.
  python profiles.py out.png a.glb [b.glb ...]
"""
import sys, json
import bpy
from PIL import Image, ImageDraw

COLORS = [(120, 120, 130), (220, 60, 80), (40, 160, 220), (60, 180, 90)]


def load(path):
    from mathutils.bvhtree import BVHTree
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    verts, faces = [], []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not any(k in o.name for k in ("main", "skin")):
            continue
        me = o.data
        mw = o.matrix_world
        base = len(verts)
        verts += [mw @ v.co for v in me.vertices]
        faces += [[base + i for i in p.vertices] for p in me.polygons]
    return BVHTree.FromPolygons(verts, faces)


def _cast(bvh, o, d, far=0.5):
    from mathutils import Vector
    hits = []
    o = Vector(o); d = Vector(d)
    for _ in range(8):
        loc, n, i, dist = bvh.ray_cast(o, d, far)
        if loc is None:
            break
        hits.append(loc)
        o = loc + d * 1e-4
    return hits


def profiles(bvh, H=1.64, dz=0.002):
    out = {"mid_f": {}, "mid_b": {}, "bust_f": {}, "width": {}, "inner": {}}
    z = 0.36
    while z < 1.42:
        f = _cast(bvh, (0, -0.5, z), (0, 1, 0), 1.0)
        if f:
            out["mid_f"][z] = f[0].y
            out["mid_b"][z] = _cast(bvh, (0, 0.5, z), (0, -1, 0), 1.0)[0].y
        b = _cast(bvh, (0.05 * H, -0.5, z), (0, 1, 0), 0.5)
        if b and z > 1.0:
            out["bust_f"][z] = b[0].y
        if z < 1.4:
            h = [p for p in _cast(bvh, (0, 0.0, z), (1, 0, 0), 0.3) if p.x < 0.19]
            if h:
                if f:
                    out["width"][z] = h[0].x
                else:
                    out["inner"][z] = h[0].x
                    if len(h) > 1:
                        out["width"][z] = h[1].x
        z += dz
    return out


def draw(sets, out, labels):
    S = 1700  # px per metre
    W, Hh = 900, 1650
    im = Image.new("RGB", (W, Hh), (250, 250, 252))
    d = ImageDraw.Draw(im)
    z0 = 0.5
    def P(ox, v, z):
        return (ox + v * S, Hh - 20 - (z - z0) * S)
    for zz in range(50, 142, 2):
        y = Hh - 20 - (zz / 100 - z0) * S
        d.line([(0, y), (W, y)], fill=(232, 232, 236))
        d.text((2, y - 10), f"{zz/100:.2f}", fill=(150, 150, 150))
    for i, (p, lab) in enumerate(zip(sets, labels)):
        c = COLORS[i % len(COLORS)]
        # side view: front to the left, centre at x=330
        for key in ("mid_f", "mid_b", "bust_f"):
            ser = sorted((z, v) for z, v in p[key].items() if z > z0)
            d.line([P(300, v, z) for z, v in ser], fill=c, width=2 if key != "bust_f" else 1)
        for key in ("width", "inner"):
            ser = sorted((z, v) for z, v in p[key].items() if z > z0)
            d.line([P(600, v, z) for z, v in ser], fill=c, width=2)
        d.text((10, 10 + 14 * i), lab, fill=c)
    d.text((250, 40), "side (front left): midline + through bust", fill=(80, 80, 80))
    d.text((600, 40), "front half-width / inner thigh", fill=(80, 80, 80))
    im.save(out)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    out, glbs = args[0], args[1:]
    sets = [profiles(load(g)) for g in glbs]
    draw(sets, out, [g.split("/")[-1] for g in glbs])
    json.dump([{k: {f"{z:.3f}": round(v, 4) for z, v in s.items()} for k, s in p.items()} for p in sets], open(out + ".json", "w"))

"""Emilia in Arc 6 — a complete base character, with the cloak and hood as
modular parts the game shows and hides (per the Arc 6 references: cloak on
with the hood up, cloak on with the hood down, and the cloak taken off).

Base (always present):
  a fitted purple bodysuit (bare shoulders, a seam down the front) over
  her figure; the white chest covering — cloth draped over the bust from a
  high white collar, its halves meeting in a curved seam, lifted by the
  bust so its scalloped hem hangs a little free, the purple showing in the
  arched opening below the bust; a compact gold-and-purple neck ornament
  (a gold crown bar over a purple crescent, a gold diamond beneath);
  detached puffy white sleeves gathered at pink cuffs; white boots with a
  purple V at the top; long, loose silver hair with straight bangs,
  face-framing strands and pointed elf ears.

Parts (`<id>_part_<name>` meshes, see src/data/characters.ts `looks`):
  cloak      the long white cloak lined lavender, the soft scalloped capelet
             over the shoulders and the round gold clasp at the throat;
  hoodup     the hood worn up, with purple-tipped cat ears;
  hooddown   the hood down, bunched behind the neck and lying on the
             shoulders, its ears flopped back;
  hairback   the long back hair (it goes inside the hood when that's up);
  ornaments  the crown braid, the white flower, the coiled bun and its long
             purple ribbons (under the hood when that's up).
"""
from __future__ import annotations

import math
import os

import bmesh
import bpy  # noqa: F401
from mathutils import Matrix, Vector

import accessories as acc
import roster as R
import tailor as t
from hair import Clump, HeadFrame
from humanoid import Joints
from torso_contours import TorsoContours
from outfit import Garments, ZoneContext, cape
from party import arm_axis, cat_ear, hood_up, shoes, under_shoes, wrist_cuts

# Where the detached sleeves start, along the arm from the shoulder joint (fraction of H).
SLEEVE_START = 0.058
# Her frame (BodySpec multipliers): the ribcage and shoulders set how far
# out the torso's sides are, which the fitting below must know.
BODY_CHEST = 1.27
BODY_SHOULDER = 1.03
# Thin front panel pattern/depth are defined in emilia_panels.py. The suit's
# clean upper boundary is cut into the body before material assignment.
COLLAR_Z = 0.829
SUIT_TOP = 0.762


# --------------------------------------------------------------------------- the chest covering


def _triangulate_chest(j: Joints) -> None:
    """Split the body's quads over the chest into triangles before any
    cloth is fitted to it. The bust bends those quads strongly; the fitting
    rays see one diagonal and the exporter may pick the other, which
    pushes the bent half through the thin garment."""
    H = j.H
    bm = bmesh.new()
    bm.from_mesh(j.body.data)
    faces = []
    for f in bm.faces:
        c = f.calc_center_median()
        if len(f.verts) > 3 and c.y < 0.0 and 0.62 * H < c.z < 0.86 * H and abs(c.x) < 0.11 * H:
            faces.append(f)
    bmesh.ops.triangulate(bm, faces=faces, quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(j.body.data)
    bm.free()
    j._base_bvh = None
    j._bvh = None


def chest_cover(name: str, j: Joints, mat) -> bpy.types.Object:
    """Two thin front panels supported by the completed torso."""
    from emilia_panels import chest_panels

    return chest_panels(name, j, mat)


def high_collar(name: str, j: Joints, mat) -> bpy.types.Object:
    """A slim white stand-up collar hugging the neck (per the reference): a
    little higher behind than in front, a small notch where its edges meet
    at the front, a crisp, lightly rolled top edge. Each row is fitted to
    the neck at its own height, so its foot follows the neck's widening
    base down into the chest garment (and no skin shows through it)."""
    H = j.H
    z0 = j.neck_base.z - 0.012 * H
    segs, rows = 48, 8

    def centre_y(zz: float) -> float:
        f = t.front_point(j, 0.0, zz, 0.0)
        b = t.front_point(j, 0.0, zz, 0.0, side=1.0)
        yf = f[0].y if f else j.neck_base.y - 0.04 * H
        yb = b[0].y if b else j.neck_base.y + 0.04 * H
        return (yf + yb) / 2

    heights, radii, centres = [], [], []
    for r in range(rows + 1):
        v = r / rows
        hrow, rrow = [], []
        for i in range(segs):
            a = 2 * math.pi * i / segs  # 0 = front
            back = (1 - math.cos(a)) / 2
            h = (0.021 + 0.006 * back) * H
            notch = 0.006 * H * max(0.0, 1 - abs(math.atan2(math.sin(a), math.cos(a))) / 0.3) ** 1.5
            hrow.append(z0 + v * (h - notch * v))
        zz = sum(hrow) / segs
        cy = centre_y(zz)
        for i in range(segs):
            a = 2 * math.pi * i / segs
            d = Vector((math.sin(a), -math.cos(a), 0.0))
            o = Vector((0.0, cy, hrow[i]))
            hit = t.surface_point(j, o, d)
            rrow.append((hit[0] - o).length if hit else 0.04 * H)
        heights.append(hrow)
        radii.append(rrow)
        centres.append(cy)
    # The top rows hug the neck; lower down the foot may widen with it,
    # but not out over the shoulders.
    for r in range(rows - 1, -1, -1):
        for i in range(segs):
            radii[r][i] = min(radii[r][i], radii[r + 1][i] * 1.12)
    for r in range(rows + 1):
        rr = radii[r]
        radii[r] = [(rr[i - 1] + 2 * rr[i] + rr[(i + 1) % segs]) / 4 for i in range(segs)]
    bm = bmesh.new()
    grid = []
    for r in range(rows + 1):
        v = r / rows
        ease = (0.0016 + 0.0011 * (1 - v) ** 2) * H
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            rad = radii[r][i] + ease
            row.append(bm.verts.new(Vector((math.sin(a) * rad, centres[r] - math.cos(a) * rad, heights[r][i]))))
        grid.append(row)
    top_edge = [vv.co.copy() for vv in grid[-1]]
    for r in range(rows):
        for i in range(segs):
            bm.faces.new((grid[r][i], grid[r][(i + 1) % segs], grid[r + 1][(i + 1) % segs], grid[r + 1][i]))
    bm.normal_update()
    if sum(fc.normal.dot(fc.calc_center_median() - Vector((0, centres[rows // 2], fc.calc_center_median().z))) for fc in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    ups = [Vector((0, 0, 1))] * (len(top_edge) + 1)
    t.tube_along(bm, top_edge + [top_edge[0]], [(0.0012 * H, 0.0011 * H)] * (len(top_edge) + 1), ups, ring=8, cap=False)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.0018 * H
    sol.offset = -1.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    for p_ in me.polygons:
        p_.use_smooth = True
    me.materials.append(mat)
    t.skin_like_body(obj, j)
    return obj


def _plate_from_outline(name: str, outline: list[tuple[float, float]], depth: float, mat, bend: float = 0.0) -> bpy.types.Object:
    """A plate (local X right, Z up, facing -Y) from a 2D outline, given
    depth; `bend` curves it back (y += bend * x^2) to follow a collar."""
    bm = bmesh.new()
    front = [bm.verts.new(Vector((x, 0, z))) for x, z in outline]
    f = bm.faces.new(front)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=Vector((0, depth, 0)))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    if bend:
        for v in bm.verts:
            v.co.y += bend * v.co.x * v.co.x
    return acc._obj(name, bm, mat, smooth=False)


def _place(o: bpy.types.Object, origin: Vector, normal: Vector) -> None:
    """Turn a local plate (facing -Y, Z up) to face `normal` at `origin`."""
    fwd = -normal.normalized()  # local +Y goes into the body
    up = Vector((0, 0, 1))
    # A proper rotation (right x fwd = up): a mirrored basis would turn the
    # plate inside out.
    right = fwd.cross(up).normalized() if abs(fwd.z) < 0.98 else Vector((1, 0, 0))
    up = right.cross(fwd).normalized()
    m = Matrix((right, fwd, up)).transposed().to_4x4()
    o.data.transform(Matrix.Translation(origin) @ m)


def _crescent(w: float, low: float, high: float, horn: float, peak: float, n: int = 14) -> list[tuple[float, float]]:
    """A crowned crescent (local x right, z up): a smile-shaped band whose
    ends sweep up into horns, rising to a crown point at the centre top."""
    pts = []
    for k in range(n + 1):
        u = k / n * 2 - 1
        pts.append((u * w, low + (horn - low) * u * u))
    for k in range(n, -1, -1):
        u = k / n * 2 - 1
        z = high + (horn - high) * abs(u) ** 1.6
        if abs(u) < 0.22:
            z += (0.22 - abs(u)) / 0.22 * peak
        pts.append((u * w * 0.985, z))
    return pts


def _rhombus(w: float, h: float) -> list[tuple[float, float]]:
    return [(0, -h), (w, 0), (0, h), (-w, 0)]


def neck_ornament(j: Joints, gold, purple, rest_on=None) -> list[bpy.types.Object]:
    """The ornament at the base of the collar (per the close-up reference):
    a compact gold crown-shaped bar — level shoulders, a raised point at the
    centre, a round notch under it, its ends dipping — layered over a purple
    crescent that curves up to meet its ends, and a small gold diamond
    hanging beneath. It curves back a little with the collar, and rests on
    the garment and collar (`rest_on`) rather than floating in front."""
    H = j.H
    hit = t.front_point(j, 0.0, j.neck_base.z - 0.011 * H, 0.0)
    if hit is None:
        return []
    p, n = hit
    n = Vector((n.x * 0.2, n.y, n.z * 0.35)).normalized()
    tree = t.bvh_of(rest_on) if rest_on else None

    def seat(q: Vector, depth: float) -> Vector:
        """Where a plate `depth` thick sits with its back on the cloth at q."""
        surf = q + n * 0.0085 * H
        if tree is not None:
            h = tree.ray_cast(q + n * 0.1 * H, -n)
            if h[0] is not None:
                surf = h[0]
        return surf + n * (depth + 0.0003 * H)

    k_ = 1.08  # a little more presence than the earlier compact version
    w = 0.025 * k_
    bend = 0.008 * H / (w * H) ** 2
    out = []
    bar = []
    # Top edge, left to right: the end hooked down round the crescent's
    # horn, a level shoulder, the centre point.
    for x, z in ((-1.0, -0.0078), (-1.02, -0.0042), (-0.94, -0.0004), (-0.8, 0.0014), (-0.5, 0.0021), (-0.22, 0.0025), (-0.09, 0.0034), (0.0, 0.0062), (0.09, 0.0034), (0.22, 0.0025), (0.5, 0.0021), (0.8, 0.0014), (0.94, -0.0004), (1.02, -0.0042), (1.0, -0.0078)):
        bar.append((x * w, z * k_))
    # Bottom edge back, right to left: up the inside of the hooked end, then
    # along under the bar with the round notch under the point.
    for x, z in ((0.9, -0.0062), (0.84, -0.0042), (0.6, -0.0038), (0.2, -0.0038)):
        bar.append((x * w, z * k_))
    for k in range(1, 8):
        a_ = math.pi * k / 8
        bar.append((math.cos(a_) * 0.17 * w, (-0.0038 + math.sin(a_) * 0.0028) * k_))
    for x, z in ((-0.2, -0.0038), (-0.6, -0.0038), (-0.84, -0.0042), (-0.9, -0.0062)):
        bar.append((x * w, z * k_))
    # The purple crescent lies on the cloth; the gold bar is layered over it.
    base = seat(p, 0.0032 * H)
    cres = _plate_from_outline("emilia_neck_crescent", [(x * H, z * H * k_) for x, z in _crescent(w * 0.92, -0.0118, -0.0036, -0.0026, 0.0)], 0.0032 * H, purple, bend=bend)
    _place(cres, base, n)
    out.append(cres)
    gold_bar = _plate_from_outline("emilia_neck_bar", [(x * H, z * H) for x, z in bar], 0.0036 * H, gold, bend=bend)
    _place(gold_bar, base + n * 0.0016 * H, n)
    out.append(gold_bar)
    drop_at = p + Vector((0, 0, -0.0175 * k_ * H))
    drop = _plate_from_outline("emilia_neck_drop", [(x * H, z * H) for x, z in _rhombus(0.0042 * k_, 0.0068 * k_)], 0.003 * H, gold)
    _place(drop, seat(drop_at, 0.003 * H), n)
    out.append(drop)
    for o in out:
        t.skin_like_body(o, j)
    return out


def cloak_clasp(j: Joints, gold, inset) -> list[bpy.types.Object]:
    """The cloak's round gold clasp at the throat, set with purple."""
    H = j.H
    hit = t.front_point(j, 0.0, j.neck_base.z - 0.004 * H, 0.0)
    if hit is None:
        return []
    p, n = hit
    n = Vector((n.x * 0.3, n.y, n.z * 0.3)).normalized()
    out = []
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=0.0125 * H, radius2=0.0115 * H, depth=0.004 * H)
    disc = acc._obj("emilia_clasp", bm, gold)
    disc.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    _place(disc, p + n * 0.026 * H, n)
    out.append(disc)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.0072 * H, radius2=0.0072 * H, depth=0.0045 * H)
    gem = acc._obj("emilia_clasp_inset", bm, inset)
    gem.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    _place(gem, p + n * 0.0278 * H, n)
    out.append(gem)
    for o in out:
        o["bone"] = "upperChest"
        o["part"] = "cloak"
    return out


def puffed_cuff(name: str, j: Joints, centre: Vector, axis: Vector, mat) -> bpy.types.Object:
    """A soft pink cuff where the sleeve gathers at the wrist: a rounded,
    padded band (not a painted ring), skinned like the forearm."""
    H = j.H
    axis = axis.normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    a = axis.cross(ref).normalized()
    b = axis.cross(a).normalized()
    # How thick the wrist is here.
    rs = []
    for k in range(8):
        ang = 2 * math.pi * k / 8
        hit = t.surface_point(j, centre, a * math.cos(ang) + b * math.sin(ang), 0.0)
        if hit:
            rs.append((hit[0] - centre).length)
    r = (sum(rs) / len(rs) if rs else 0.025 * H) + 0.011 * H
    pts, ups = [], []
    for k in range(33):
        ang = 2 * math.pi * k / 32
        radial = a * math.cos(ang) + b * math.sin(ang)
        pts.append(centre + radial * r)
        ups.append(radial)
    bm = bmesh.new()
    t.tube_along(bm, pts, [(0.0125 * H, 0.0085 * H)] * len(pts), ups, ring=12, cap=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = acc._obj(name, bm, mat)
    t.skin_like_body(o, j)
    return o


# --------------------------------------------------------------------------- the cloak's mantle


def capelet(name: str, j: Joints, mat, lining, over=None) -> bpy.types.Object:
    """The cloak's white capelet (per the anime references): from the
    throat it covers the shoulders and falls over the upper arms and the
    upper back, softening and broadening the shoulder line; in front its
    two panels part below the clasp; its hem is cut in soft scallops and
    rolled. It lies on the body and over the long cloak (`over`), lined."""
    from outfit import drape_down

    H = j.H
    tree = t.bvh_of([over]) if over is not None else None
    gap = math.radians(34)  # the opening under the clasp, at the hem
    a0, a1 = gap / 2, 2 * math.pi - gap / 2
    segs, rings = 112, 10
    rx_in, ry_in = 0.044 * H, 0.042 * H
    scallops = 16
    grid = []
    for r in range(rings + 1):
        tr = r / rings
        row = []
        for i in range(segs + 1):
            a = a0 + (a1 - a0) * i / segs  # pi = straight back
            fb = (1 + math.cos(a)) / 2  # 1 at the front
            side = abs(math.sin(a))
            # Reach: to the upper chest in front, over the upper arm at the
            # sides, down the upper back behind; a soft scallop at the hem.
            reach = 0.086 * fb + 0.17 * side * (1 - fb) ** 0.3 + 0.136 * (1 - fb) * (1 - side)
            reach = max(reach, 0.086)
            sc = abs(math.sin(scallops * (a - a0) / 2)) ** 0.55
            reach = reach * (0.94 + 0.08 * sc * min(1.0, tr * 1.3))
            # The front edges run down from the throat (a narrow V).
            end = t.smoothstep(0.0, 0.35, min(a - a0, a1 - a))
            ext = tr * reach * H * (0.55 + 0.45 * end)
            radial = Vector((math.sin(a), -math.cos(a), 0))
            x = radial.x * (rx_in + ext)
            y = j.neck_base.y + radial.y * (ry_in + ext)
            radial_d = math.hypot(x, y - j.neck_base.y)
            slope = 0.65 + 0.55 * (1 - fb)
            cone = j.neck_base.z + 0.004 * H - slope * max(0.0, radial_d - rx_in)
            p = drape_down(j, x, y, 0.009 * H)
            if tree is not None:
                hit = tree.ray_cast(Vector((x, y, j.head_top.z + 0.05 * H)), Vector((0, 0, -1)))
                if hit[0] is not None and (p is None or hit[0].z + 0.006 * H > p.z):
                    p = hit[0] + Vector((0, 0, 0.006 * H))
            if p is None or p.z < cone:
                p = Vector((x, y, cone))
            # Soft fullness: a puffed arch across it, falling away at the hem
            # in gathered folds.
            arch = 0.013 * H * math.sin(math.pi * min(1.0, tr * 1.1)) ** 0.8
            fall = 0.022 * H * t.smoothstep(0.6, 1.0, tr) ** 1.5
            fold = math.sin(scallops * (a - a0)) * 0.0052 * H * tr ** 1.5
            p = p + Vector((0, 0, arch - fall)) + radial * (fold + 0.007 * H * tr * tr)
            row.append(p)
        grid.append(row)
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in grid]
    for r in range(rings):
        for i in range(segs):
            bm.faces.new((vs[r][i], vs[r][i + 1], vs[r + 1][i + 1], vs[r + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.011 * H
    sol.offset = -1.0
    sol.use_rim = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    me.materials.append(mat)
    me.materials.append(lining)
    for poly in me.polygons:
        poly.use_smooth = True
        if poly.normal.z < -0.3:
            poly.material_index = 1
    # The rolled hem along the scalloped edge and up the front edges.
    hem = [grid[r][0] for r in range(2, rings)] + grid[-1] + [grid[r][-1] for r in range(rings - 1, 1, -1)]
    ups = []
    for p in hem:
        q = Vector((p.x, p.y - j.neck_base.y, 0))
        ups.append((q.normalized() if q.length > 1e-6 else Vector((0, 1, 0))) * 0.4 + Vector((0, 0, 1)))
    bm = bmesh.new()
    t.tube_along(bm, [p + Vector((0, 0, -0.004 * H)) for p in hem], [(0.0064 * H, 0.0054 * H)] * len(hem), ups, ring=8)
    hem_o = acc._obj(name + "_hem", bm, mat)
    out = acc.join([obj, hem_o], name)
    t.skin_like_body(out, j)
    return out


# --------------------------------------------------------------------------- hair ornaments


def _resample(points: list[Vector], step: float) -> list[Vector]:
    """Evenly spaced points along a polyline (a smooth Catmull-Rom through it)."""
    dense = []
    n = len(points)
    for i in range(n - 1):
        p0, p1, p2, p3 = points[max(i - 1, 0)], points[i], points[i + 1], points[min(i + 2, n - 1)]
        for k in range(12):
            u = k / 12
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    dense.append(points[-1].copy())
    out = [dense[0]]
    acc_len = 0.0
    for a, b in zip(dense, dense[1:]):
        acc_len += (b - a).length
        if acc_len >= step:
            out.append(b.copy())
            acc_len = 0.0
    return out


def _braid(name: str, points: list[Vector], centre: Vector, width: float, mat) -> bpy.types.Object:
    """A three-strand braid lying on the head: a slim core with pointed,
    leaf-shaped lobes crossing it alternately from each side in a
    herringbone, each bent to the curve of the skull, tapering a little
    towards the end."""
    path = _resample(points, width * 0.34)
    bm = bmesh.new()
    n = len(path)
    # The core, so no gaps show between the lobes.
    core_ups = [(c - centre).normalized() for c in path]
    t.tube_along(bm, path, [(width * 0.24 * (1 - 0.25 * i / max(1, n - 1)), width * 0.2) for i in range(n)], core_ups, ring=8)
    for i, c in enumerate(path):
        tan = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        up = (c - centre).normalized()
        up = (up - tan * up.dot(tan)).normalized()
        side = tan.cross(up).normalized()
        k = 1.0 - 0.28 * i / max(1, n - 1)
        sgn = 1 if i % 2 else -1
        # Each lobe crosses from its side over the middle and down the other.
        axis = (tan * 0.85 + side * (-sgn) * 0.55).normalized()
        L, W, T = 0.74 * width * k, 0.27 * width * k, 0.3 * width * k
        mid = c + side * sgn * 0.05 * width * k + up * T * 0.9
        pts, radii, ups = [], [], []
        for q in range(9):
            tt = q / 8
            along = (tt - 0.5) * L
            # Ends tuck down towards the head.
            p_ = mid + axis * along - up * (4 * (tt - 0.5) ** 2) * T * 1.1
            pts.append(p_)
            prof = math.sin(math.pi * tt) ** 0.7
            radii.append((W * max(prof, 0.05), T * max(prof, 0.08)))
            ups.append(up)
        t.tube_along(bm, pts, radii, ups, ring=8, cap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return acc._obj(name, bm, mat)


def _flower(name: str, position: Vector, normal: Vector, radius: float, mat_petal, mat_centre, petals: int = 5) -> bpy.types.Object:
    """A white flower clip: rounded, slightly cupped petals that overlap at
    their bases, a soft centre."""
    bm = bmesh.new()
    rows, cols = 7, 6
    for i in range(petals):
        a = 2 * math.pi * i / petals
        dirv = Vector((math.cos(a), math.sin(a), 0))
        perp = Vector((-math.sin(a), math.cos(a), 0))
        grid = []
        for r in range(rows + 1):
            t_ = r / rows
            # A rounded petal: narrow at the base, broad and round at the tip.
            half = radius * 0.36 * math.sqrt(max(0.0, 1 - ((t_ - 0.58) / 0.62) ** 2))
            row = []
            for c in range(cols + 1):
                q = (c / cols) * 2 - 1
                pt = dirv * (radius * (0.12 + 0.88 * t_)) + perp * half * q
                # Cupped along and across.
                pt.z = 0.32 * radius * t_ * t_ + 0.1 * radius * q * q * t_ + 0.012 * radius * i
                row.append(bm.verts.new(pt))
            grid.append(row)
        for r in range(rows):
            for c in range(cols):
                bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    petals_o = acc._obj(name, bm, mat_petal)
    sol = petals_o.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = radius * 0.07
    bpy.context.view_layer.objects.active = petals_o
    bpy.ops.object.modifier_apply(modifier=sol.name)
    acc.orient(petals_o, position, normal, spin=0.3)
    bm2 = bmesh.new()
    bmesh.ops.create_uvsphere(bm2, u_segments=12, v_segments=8, radius=1.0)
    for v in bm2.verts:
        v.co = Vector((v.co.x * radius * 0.2, v.co.y * radius * 0.2, v.co.z * radius * 0.12))
    centre = acc._obj(name + "_c", bm2, mat_centre)
    acc.orient(centre, position + normal.normalized() * radius * 0.1, normal)
    return acc.join([petals_o, centre], name)


def _rosette_bun(name: str, centre: Vector, n: Vector, u: Vector, v: Vector, radius: float, mat) -> bpy.types.Object:
    """A styled side bun: a soft knot of hair with broad looped sections
    folded round it like a rosette — each loop a flat lock leaving the
    centre, swinging out and round and tucking back in — slightly uneven
    in size and lean, so it reads as dressed hair, not a machined spiral."""
    bm = bmesh.new()
    geom = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for vv in geom["verts"]:
        x, y, z = vv.co
        vv.co = centre + u * x * radius * 0.62 + v * y * radius * 0.62 + n * (z * radius * 0.5 + radius * 0.16)
    loops = 6
    for k in range(loops):
        a0 = 2 * math.pi * k / loops + 0.25 * math.sin(k * 2.3)
        size = radius * (0.95 + 0.12 * math.sin(k * 1.7))
        # Alternate loops sit higher, overlapping their neighbours.
        rise = radius * (0.14 if k % 2 else 0.0)
        pts, ups, radii = [], [], []
        steps = 18
        for i in range(steps + 1):
            tt = i / steps
            ang = a0 + 1.05 * tt
            r = size * math.sin(math.pi * tt) ** 0.8
            radial = u * math.cos(ang) + v * math.sin(ang)
            # Each loop climbs from the knot's rim and arches over.
            h = rise + radius * (0.3 + 0.32 * math.sin(math.pi * tt)) * (1 - 0.45 * (r / radius))
            pts.append(centre + radial * r + n * h)
            ups.append((n * 1.0 + radial * 0.9 * math.sin(math.pi * tt)).normalized())
            w = radius * 0.36 * (0.55 + 0.45 * math.sin(math.pi * tt))
            radii.append((w, w * 0.4))
        t.tube_along(bm, pts, radii, ups, ring=10, cap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return acc._obj(name, bm, mat)


def _bow_knot(name: str, at: Vector, n: Vector, side: Vector, size: float, mat) -> bpy.types.Object:
    """A small ribbon bow: a knot with two flat loops either side."""
    bm = bmesh.new()
    up = n.cross(side).normalized()
    geom = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    for vv in geom["verts"]:
        x, y, z = vv.co
        vv.co = at + side * x * size * 0.32 + up * y * size * 0.3 + n * z * size * 0.22
    for sgn in (1, -1):
        pts, ups, radii = [], [], []
        for k in range(17):
            a = 2 * math.pi * k / 16
            # A loop out to the side and back, pinched at the knot.
            x = size * 0.95 * (1 - math.cos(a)) / 2
            pts.append(at + side * sgn * (x + size * 0.08) + up * math.sin(a) * size * 0.36 + n * size * 0.05)
            ups.append(n)
            radii.append((size * 0.2, size * 0.05))
        t.tube_along(bm, pts, radii, ups, ring=8, cap=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return acc._obj(name, bm, mat)


# --------------------------------------------------------------------------- spec


def emilia_arc6():
    spec = R.emilia()
    # This task excludes the cape. Retain the exact Claude cape/capelet,
    # clasp and hood mesh attributes after export, since their procedural
    # draping would otherwise refit them indirectly to the corrected body.
    frozen = os.path.join(os.path.dirname(__file__), "frozen", "emilia_cloak_c97eceef.glb")
    spec.frozen_parts = {f"emilia_part_{part}": frozen for part in ("cloak", "hooddown", "hoodup")}
    # One continuous torso, constrained by front widths and side depths.
    # These are section landmarks in H units, not breast-size multipliers.
    # The broad transverse front and its shallow center share the ribcage.
    # No ellipsoid wrap or legacy spherical bust runs for Emilia.
    spec.body.bust = 0.0
    spec.body.extra["torso_contours"] = TorsoContours(sections=(
        # z       width   front   back    front spread
        (0.560,   0.0720, 0.0580, 0.0450, 0.000),
        (0.600,   0.0628, 0.0550, 0.0400, 0.000),
        (0.635,   0.0643, 0.0540, 0.0415, 0.000),
        (0.670,   0.0700, 0.0590, 0.0435, 0.020),
        (0.690,   0.0750, 0.0680, 0.0450, 0.070),
        (0.715,   0.0795, 0.0740, 0.0460, 0.130),
        (0.735,   0.0815, 0.0740, 0.0455, 0.135),
        (0.755,   0.0830, 0.0670, 0.0446, 0.105),
        (0.775,   0.0840, 0.0540, 0.0430, 0.052),
        (0.795,   0.0860, 0.0400, 0.0400, 0.012),
        (0.818,   0.0720, 0.0330, 0.0350, 0.000),
    ), silhouette_rows=(
        # z      width   center  front30 outer60 back
        # Smooth upper slope, a lower supported crest, a restrained outer
        # return. The supplied side pose obscures exact depths; reconcile
        # these landmarks with the front envelope and the 40-degree view.
        (0.650, 0.0665, 0.0550, 0.0515, 0.0310, 0.0425),
        (0.675, 0.0707, 0.0575, 0.0580, 0.0330, 0.0440),
        (0.695, 0.0750, 0.0640, 0.0720, 0.0430, 0.0452),
        (0.717, 0.0790, 0.0750, 0.0870, 0.0520, 0.0460),
        (0.735, 0.0805, 0.0760, 0.0875, 0.0510, 0.0455),
        (0.755, 0.0800, 0.0700, 0.0780, 0.0440, 0.0446),
        (0.778, 0.0800, 0.0540, 0.0610, 0.0340, 0.0430),
        (0.798, 0.0815, 0.0410, 0.0420, 0.0240, 0.0400),
        (0.818, 0.0720, 0.0330, 0.0300, 0.0180, 0.0350),
    ))
    # Retain the Claude pelvis, hips, thighs and lumbar line. No abdominal
    # protrusion, under-rib indentation or iliac bumps are added.
    spec.body.extra["torso_sculpt"] = dict(waist_in=0.07, hip_out=0.065, hip_dz=0.01, thigh_out=0.06, navel=0.0009, navel_rx=0.0032, navel_rz=0.0062, navel_dz=-0.014, lumbar=0.006)
    # One even step finer over the whole torso, one more over the bust.
    spec.body.extra["torso_detail"] = 1
    spec.body.extra["chest_detail"] = 2
    # A natural feminine frame rather than a stick: a fuller ribcage, a
    # softly defined waist, hips a little wider than it.
    spec.body.chest = BODY_CHEST
    spec.body.waist = 0.86
    spec.body.hips = 1.44
    spec.body.shoulder = BODY_SHOULDER
    # Fuller thighs and calves under the bodysuit, as drawn.
    spec.body.trouser = 1.16
    spec.head.elf_ear = 1.6
    spec.head.elf_out = 1.0
    # Her ears stand out of her hair — and go under the hood when it's up.
    spec.ear_part = "elfears"

    # ---- Hair: straight, even bangs; long face-framing strands in front
    # of the ears; a smooth crown; long back hair in broad, layered groups.
    spec.head.ear = 1.12
    clumps = []
    # Bangs: a straight fringe made of narrow, soft individual locks, each
    # ending in a gently rounded point; lengths, angles and depths vary a
    # little so they read as locks, not a cut edge or a sawtooth.
    vary = [0.0, 0.022, -0.012, 0.03, -0.006, 0.014, -0.018, 0.026, 0.004, 0.026, -0.018, 0.014, -0.006, 0.03, -0.012, 0.022, 0.0]
    lean = [0.0, -0.04, 0.03, -0.02, 0.04, -0.03, 0.02, -0.04, 0.0, 0.04, -0.02, 0.03, -0.04, 0.02, -0.03, 0.04, 0.0]
    for i, az in enumerate(range(-64, 65, 8)):
        side = math.sin(math.radians(az))
        ln = 0.55 + 0.07 * (abs(az) / 64) ** 2 + vary[i]
        clumps.append(Clump(az=az, el=60, direction=(side * 0.15 + lean[i], -0.75, -0.8), length=ln, width=0.21, thickness=0.045, stiffness=0.3, gravity=1.2, lift=0.008 + (0.006 if i % 2 else 0.0), hold=0.8, tip=1.3, blunt=0.2, twist=0.15 if i % 3 == 1 else (-0.15 if i % 3 == 2 else 0.0)))
    # A couple of thin wisps a little longer than the rest (as drawn).
    for az in (-22, 26):
        side = math.sin(math.radians(az))
        clumps.append(Clump(az=az, el=61, direction=(side * 0.12, -0.75, -0.8), length=0.64, width=0.1, thickness=0.035, stiffness=0.3, gravity=1.2, lift=0.016, hold=0.55, tip=1.3, blunt=0.08))
    # A shorter layer under them, offset between them: the little gaps
    # between the lock tips show hair, not forehead.
    for az in range(-60, 61, 8):
        side = math.sin(math.radians(az))
        clumps.append(Clump(az=az, el=60, direction=(side * 0.15, -0.75, -0.8), length=0.5 + 0.06 * (abs(az) / 64) ** 2, width=0.26, thickness=0.04, stiffness=0.3, gravity=1.2, lift=0.0, hold=0.72, tip=1.5, blunt=0.3))
    for az in (-69, 69):
        clumps.append(Clump(az=az, el=34, direction=(math.copysign(0.16, az), -0.4, -1.0), length=2.1, width=0.3, thickness=0.09, stiffness=0.3, gravity=1.3, lift=0.012, chain=f"hair_side{'L' if az > 0 else 'R'}"))
    for az in (-61, 61):
        clumps.append(Clump(az=az, el=46, direction=(math.copysign(0.1, az), -0.55, -1.0), length=1.15, width=0.26, thickness=0.085, stiffness=0.35, gravity=1.2, lift=0.01))
    # The crown: thin, flat locks lying on the scalp, flowing down from the
    # top of the head (a smooth crown, not tufts).
    for az in range(15, 360, 30):
        if 0 < az < 60:
            continue  # the crown braid lies there, on the scalp
        a = math.radians(az)
        cl = Clump(az=az, el=80, direction=(math.sin(a) * 0.98, -math.cos(a) * 0.98, -0.2), length=0.5, width=0.46, thickness=0.04, stiffness=0.0, gravity=1.4, lift=-0.004, root_offset=0.0, hold=0.7, tip=1.2)
        if 100 < az < 260:
            cl.part = "hairback"
        clumps.append(cl)
    # Behind the crown, a row that carries the top of the head into the
    # back hair without a gap.
    for az in range(104, 257, 22):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=54, direction=(math.sin(a) * 0.4, 0.7, -0.7), length=0.95, width=0.5, thickness=0.09, stiffness=0.2, gravity=1.2, lift=0.006, part="hairback"))

    def chain_of(az: float) -> str:
        return f"hair_back{min(4, max(0, int((az - 108) / 145 * 5)))}"

    # Back hair: a full under-layer, then a few large masses over it at
    # increasing depth — each turned and curved a little differently, their
    # tips at staggered lengths — so the back reads as overlapping groups,
    # not one sheet.
    for k, az in enumerate(range(105, 256, 25)):
        a = math.radians(az)
        centre = abs(az - 180) < 30
        clumps.append(Clump(az=az, el=-10, direction=(math.sin(a) * 0.45, 0.75, -0.7), length=3.3 if centre else 3.0 + 0.08 * (k % 2), width=0.62 if centre else 0.56, thickness=0.1, stiffness=0.32, gravity=1.3, lift=0.004, hold=0.62 if centre else 0.42, chain=chain_of(az), part="hairback"))
    for k, (az, ln) in enumerate(((120, 3.28), (150, 3.42), (180, 3.5), (210, 3.42), (240, 3.28))):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=14, direction=(math.sin(a) * 0.55, 0.75, -0.7), length=ln, width=0.58 if az == 180 else 0.55, thickness=0.1, stiffness=0.32, gravity=1.3, curl=0.08 if k % 2 else -0.08, twist=0.18 if k % 2 else -0.18, lift=0.03, hold=0.6 if az == 180 else 0.45, chain=chain_of(az), part="hairback"))
    for k, (az, ln, curl, lift, spread) in enumerate(((132, 3.55, -0.24, 0.05, 0.75), (164, 3.72, 0.14, 0.078, 0.6), (196, 3.66, -0.14, 0.064, 0.6), (228, 3.55, 0.24, 0.086, 0.75))):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=36, direction=(math.sin(a) * spread, 0.75, -0.7), length=ln, width=0.52, thickness=0.12, stiffness=0.34, gravity=1.3, curl=curl, twist=-curl * 2.0, lift=lift, hold=0.5, chain=chain_of(az), part="hairback"))
    # And one mass down the middle, outermost of all.
    clumps.append(Clump(az=180, el=46, direction=(0.0, 0.8, -0.6), length=3.45, width=0.46, thickness=0.12, stiffness=0.36, gravity=1.3, twist=0.22, lift=0.105, hold=0.52, chain=chain_of(180), part="hairback"))
    spec.hair.clumps = clumps
    spec.hair.chains = {"hair_back0": 5, "hair_back1": 5, "hair_back2": 5, "hair_back3": 5, "hair_back4": 5, "hair_sideL": 4, "hair_sideR": 4}

    spec.palette.update({
        "hair": ("#dedaee", "hair"),
        "suit": ("#7656c0", "cloth"),
        "seam": ("#5a3d9c", "cloth"),
        # The navel's small drawn mark (a darker purple, as the anime draws it).
        "navel": ("#4d3690", "cloth"),
        "chest": ("#fbfbff", "cloth"),
        "sleeve": ("#fbfbff", "cloth"),
        "cuff": ("#f4a9b8", "cloth"),
        "gold": ("#e0bb5e", "metal"),
        "ornament": ("#6a46b6", "cloth"),
        "cloak": ("#ffffff", "cloth"),
        "lining": ("#cbbcec", "cloth"),
        "ear_tip": ("#8a62d4", "cloth"),
        "boot": ("#f7f6fb", "cloth"),
        "boot_trim": ("#8d6ad0", "cloth"),
        "sole": ("#8d6ad0", "cloth"),
        "flower": ("#fdfdff", "cloth"),
        "flower_c": ("#d9cdf5", "cloth"),
        "ribbon": ("#6a45b8", "cloth"),
    })

    def boots_top(c: ZoneContext) -> float:
        return c.j.knee_l.z + 0.05 * c.H

    def on_arm(c: ZoneContext) -> bool:
        """The arm, not the side of the torso below the armpit (which the
        fuller bust brings close to the upper arm): below the shoulder joint
        the arm angles away from the body, so anything inside its inner
        surface there is torso."""
        if not c.on_arm():
            return False
        a = c.j.arm_l
        if c.p.z < a.z:
            inner = a.x + (a.z - c.p.z) / math.tan(math.radians(42)) - 0.042 * c.H
            if abs(c.p.x) < inner:
                return False
        return True

    def bare_shoulder(c: ZoneContext) -> bool:
        # A planar suit edge follows real cut edges instead of selecting
        # whole faces against the removed cylindrical garment pattern.
        # The upper arm remains bare until the detached sleeve starts.
        return c.p.z > SUIT_TOP * c.H or (on_arm(c) and c.arm_s() < (SLEEVE_START + 0.012) * c.H)

    def navel_mark(c: ZoneContext) -> bool:
        ts = spec.body.extra["torso_sculpt"]
        nz = c.j.waist.z / c.H + ts["navel_dz"]
        return c.p.y < 0 and (c.p.x / c.H / 0.0014) ** 2 + ((c.p.z / c.H - nz - 0.0008) / 0.0046) ** 2 < 1

    spec.zones = R.skin_rules(bare_shoulder) + [
        ("navel", navel_mark),
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= boots_top(c)),
        ("suit", lambda c: True),
    ]
    # A clean line round the top of the boots (the zone follows the cut).
    spec.cuts = lambda j: [(Vector((0, 0, j.knee_l.z + 0.05 * j.H)), Vector((0, 0, 1))), (Vector((0, 0, SUIT_TOP * j.H)), Vector((0, 0, 1)))]
    spec.default_zone = "suit"

    def under_sleeves(c: ZoneContext) -> bool:
        return on_arm(c) and (SLEEVE_START + 0.014) * c.H < c.arm_s() < c.arm_len() - 0.03 * c.H

    # EMILIA_BODY_ONLY=1 builds her without the chest garment, collar and
    # ornament, to judge the figure on its own.
    body_only = bool(os.environ.get("EMILIA_BODY_ONLY"))
    # Keep the entire torso under the thin panels. Fit/collision checks use
    # this same complete surface, and review toggles cannot expose holes.
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)

    def garments(j: Joints, m: dict) -> Garments:
        g = Garments()
        H = j.H
        _triangulate_chest(j)
        # ---- Base outfit: complete without the cloak.
        if not body_only:
            chest = chest_cover("emilia_chest", j, m["chest"])
            collar = high_collar("emilia_collar", j, m["chest"])
            g.objects.extend([chest, collar])
            g.objects.extend(neck_ornament(j, m["gold"], m["ornament"], rest_on=[chest, collar]))
        # Detached sleeves: puffed from the upper arm, gathered at pink cuffs.
        cuts = list(wrist_cuts(j, 0.006))
        for s_ in (1, -1):
            a, w, d = arm_axis(j, s_)
            cuts.append((a + d * SLEEVE_START * H, -d))

        def sleeve_keep(c: ZoneContext) -> bool:
            return on_arm(c) and SLEEVE_START * H < c.arm_s() < c.arm_len() - 0.006 * H

        def sleeve_extra(p, n):
            side, s, length, d, radial = t.arm_frame(j, p)
            u = max(0.0, min(1.0, (s - SLEEVE_START * H) / max(1e-6, length - SLEEVE_START * H)))
            # Puffed, but in proportion to her frame (never wider than it).
            puff = 0.0065 * H * math.sin(math.pi * u) ** 0.8
            bell = 0.0042 * H * t.smoothstep(0.75, 1.0, u)
            return t.wrinkles(j, p, arm=0.9, seed=0.9) + puff + bell

        g.objects.append(t.shell("emilia_sleeves", j, sleeve_keep, 0.0065, m["sleeve"], cuts=cuts, thickness=0.003, extra=sleeve_extra, subdivide=1))
        for s_ in (1, -1):
            a, w, d = arm_axis(j, s_)
            top = t.frill_ring(f"emilia_sleevetop{s_}", a + d * (SLEEVE_START + 0.004) * H, -d, 0.031 * H, 0.011 * H, m["sleeve"], waves=12, flare=0.25)
            t.skin_like_body(top, j)
            g.objects.append(top)
            g.objects.append(puffed_cuff(f"emilia_cuff{s_}", j, w - d * 0.022 * H, d, m["cuff"]))
        # The bodysuit's seam down the front.
        if not body_only:
            seam = t.vertical_trim("emilia_seam", j, 0.0, j.waist.z + 0.03 * H, 0.694 * H, 0.0028, m["seam"], lift=0.0012)
            if seam:
                g.objects.append(seam)
        shoes(g, "emilia", j, m["boot"], m["sole"], length=1.12, width=0.92, height=0.95, sole=0.016, collar=0.085)
        # The boots' purple trim: round the top, dipping to a V over the knee.
        top = j.knee_l.z + 0.05 * H
        for s_ in (1, -1):
            knee = Vector((j.knee_l.x * s_, j.knee_l.y, j.knee_l.z))
            hip = Vector((j.hip_l.x * s_, j.hip_l.y, j.hip_l.z))
            path = []
            for k in range(48):
                ang = -math.pi + 2 * math.pi * k / 48
                z = top - 0.006 * H - 0.032 * H * max(0.0, 1 - abs(ang) / 0.55)
                ctr = knee.lerp(hip, (z - knee.z) / (hip.z - knee.z))
                path.append((ctr, Vector((math.sin(ang) * s_, -math.cos(ang), 0))))
            vt = t.trim(f"emilia_boot_trim{s_}", j, path, 0.011, m["boot_trim"], lift=0.0055, closed=True)
            if vt:
                g.objects.append(vt)
            # The boot's top: a rolled white lip standing proud of the leg.
            lip_path = []
            for k in range(48):
                ang = -math.pi + 2 * math.pi * k / 48
                z = top - 0.004 * H
                ctr = knee.lerp(hip, (z - knee.z) / (hip.z - knee.z))
                lip_path.append((ctr, Vector((math.sin(ang) * s_, -math.cos(ang), 0))))
            lip = t.trim(f"emilia_boot_lip{s_}", j, lip_path, 0.014, m["boot"], lift=0.004, thickness=0.006, closed=True)
            if lip:
                g.objects.append(lip)

        # ---- Part: the cloak (broad, flaring, lined lavender), the capelet
        # over the shoulders, and the clasp.
        # Worn on the shoulders and wrapping round them, its front edges at
        # her sides (behind the arms from the front), not standing as panels.
        # Its free edges are rolled, so it has the thickness of real cloth.
        edges = {}
        cp, guides = cape("emilia_cloak", j, 0.165, 0.7, m["cloak"], chains=6, bones=4, wrap=212, folds=8, fold_depth=0.036, flare=1.0, fold2=(17, 0.012), hem_curve=0.09, edge_wave=0.03, thickness=0.012, edges_out=edges)
        cp.data.materials.append(m["lining"])
        for poly in cp.data.polygons:
            c = poly.center
            radial = Vector((c.x, c.y - j.chest.y, 0))
            if radial.length > 1e-6 and poly.normal.dot(radial.normalized()) < -0.15:
                poly.material_index = 1
        bm = bmesh.new()
        for key in ("left", "right", "hem"):
            line = _resample(edges[key], 0.012 * H)
            ups = []
            for k_, q in enumerate(line):
                tan = (line[min(k_ + 1, len(line) - 1)] - line[max(k_ - 1, 0)]).normalized()
                out_d = Vector((q.x, q.y - j.chest.y, 0))
                out_d = (out_d - tan * out_d.dot(tan)).normalized() if out_d.length > 1e-6 else Vector((0, 1, 0))
                ups.append(out_d)
            t.tube_along(bm, line, [(0.007 * H, 0.0055 * H)] * len(line), ups, ring=8)
        roll = acc._obj("emilia_cloak_roll", bm, m["cloak"])
        cp = acc.join([cp, roll], "emilia_cloak")
        cp["bone"] = "upperChest"
        cp["part"] = "cloak"
        g.objects.append(cp)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"cape{i}"] = gl
            names.append(f"cape{i}")
        g.bindings[cp.name] = names
        mantle = capelet("emilia_cloak_capelet", j, m["cloak"], m["lining"], over=cp)
        mantle["bone"] = "upperChest"
        mantle["part"] = "cloak"
        g.objects.append(mantle)
        g.objects.extend(cloak_clasp(j, m["gold"], m["ornament"]))

        # ---- Part: the hood down, bunched behind the neck over the cloak,
        # its ears flopped back.
        hd = t.hood_down("emilia_hood_down", j, m["cloak"], size=1.14, over=[cp, mantle], span=70.0, rim_folds=0.22, soft=True)
        hd["part"] = "hooddown"
        g.objects.append(hd)
        f = HeadFrame(j, 0.84, 0.94)
        for s_ in (1, -1):
            base = Vector((s_ * 0.034 * H, j.neck_base.y + 0.082 * H, j.neck_base.z - 0.022 * H))
            for e in cat_ear(f"emilia_hd_ear{s_}", base, Vector((s_ * 0.45, 0.75, -0.55)), 0.3 * f.H, m["cloak"], m["ear_tip"]):
                e["bone"] = "upperChest"
                e["part"] = "hooddown"
                g.objects.append(e)
        return g

    def accessories(j: Joints, m: dict, head):
        out = []
        f = HeadFrame(j, 0.84, 0.94)
        # ---- Part: the hood up, with its cat ears.
        hood = hood_up("emilia_hood", f, m["cloak"], m["lining"], scale=1.2, opening=(66.0, 40.0), cowl=True, seam_peak=0.04)
        hood["part"] = "hoodup"
        out.append(hood)
        for s_ in (1, -1):
            a, e = math.radians(s_ * 34), math.radians(66)
            n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
            # Rooted in the hood (the base sunk into it), rising out of it.
            base = f.c + Vector((n.x * f.rw, n.y * f.rd, n.z * f.rh)) * 1.07
            for ear in cat_ear(f"emilia_ear{s_}", base, (n + Vector((0, 0, 0.6))).normalized(), 0.45 * f.H, m["cloak"], m["ear_tip"], tip_start=0.5):
                ear["part"] = "hoodup"
                out.append(ear)
        # ---- Part: hair ornaments.
        orn = []
        # Her left: a small braid along the crown, ending at a white flower clip.
        # (sampled densely on the skull at a constant height above it, clear
        # of the bangs' roots, so it follows the head's curve).
        pts = []
        for k in range(17):
            el = 74 - 22 * (k / 16) ** 1.1
            # On the bare scalp at the crown, then up over the bangs' roots.
            pts.append(f.surface(6 + 46 * k / 16, el, 0.03 + 0.04 * t.smoothstep(0.0, 1.0, (74 - el) / 13)))
        orn.append(_braid("emilia_crown_braid", pts, f.c, 0.042, m["hair"]))
        fp = f.surface(56, 48, 0.06)
        orn.append(_flower("emilia_flower", fp, (fp - f.c).normalized(), 0.036, m["flower"], m["flower_c"]))
        # Her right: a smooth, rounded bun, tied with purple at its base,
        # long purple ribbons hanging from a bow under it.
        bc = f.surface(-58, 46, 0.05)
        n = (bc - f.c).normalized()
        u = n.cross(Vector((0, 0, 1))).normalized()
        v = n.cross(u).normalized()
        orn.append(_rosette_bun("emilia_bun", bc, n, u, v, 0.042, m["hair"]))
        tie = []
        for k in range(25):
            ang = k / 24 * 2 * math.pi
            tie.append(bc + (u * math.cos(ang) + v * math.sin(ang)) * 0.0375 + n * 0.007)
        orn.append(t.ribbon("emilia_bun_tie", tie, [n] * len(tie), 0.008, m["ribbon"], thickness=0.0025, closed=True))
        # The bow sits on the tie, at the bottom of the bun, where the ribbons start.
        knot = bc - v * 0.036 + n * 0.012
        if knot.z > bc.z:
            knot = bc + v * 0.036 + n * 0.012
        orn.append(_bow_knot("emilia_bow", knot, n, u, 0.026, m["ribbon"]))
        for o in orn:
            o["part"] = "ornaments"
            out.append(o)
        guide = getattr(j, "hair_chains", {}).get("hair_sideR")
        start = knot - n * 0.002
        for i, (dx, dy, extra, twist) in enumerate(((-0.012, 0.012, 0.09, 0.35), (-0.003, 0.022, 0.14, -0.3))):
            # From the bow they drop a little, then ease into the fall of the
            # hair beside her face (and swing with it).
            ctrl = [start, start + Vector((dx * 0.5, dy * 0.4, -0.028)) - n * 0.004]
            if guide and len(guide) >= 3:
                ctrl += [q + Vector((dx, dy, 0)) for q in guide[2:]]
                tail_dir = (guide[-1] - guide[-2]).normalized()
                ctrl.append(ctrl[-1] + tail_dir * extra)
            else:
                ctrl += [start + Vector((dx, dy, -0.08 * k)) for k in range(1, 6)]
            line = _resample(ctrl, 0.012)
            nrm = []
            for k_, q in enumerate(line):
                out_d = Vector((q.x, q.y - j.neck_base.y, 0))
                out_d = out_d.normalized() if out_d.length > 1e-6 else Vector((-1, 0, 0))
                tan = (line[min(k_ + 1, len(line) - 1)] - line[max(k_ - 1, 0)]).normalized()
                nrm.append(Matrix.Rotation(twist * math.sin(math.pi * k_ / max(1, len(line) - 1)), 3, tan) @ out_d)
            rib = t.ribbon(f"emilia_ribbon{i}", line, nrm, 0.014 if i == 0 else 0.012, m["ribbon"], thickness=0.0025)
            rib["chain"] = "hair_sideR"
            rib["part"] = "ornaments"
            out.append(rib)
        return out

    spec.garments = garments
    spec.accessories = accessories
    return spec

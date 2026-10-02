"""Emilia in Arc 6 — a complete base character, with the cloak and hood as
modular parts the game shows and hides (per the Arc 6 references: cloak on
with the hood up, cloak on with the hood down, and the cloak taken off).

Base (always present):
  a fitted purple bodysuit (bare shoulders, a seam down the front); the
  white chest covering — two rounded, scallop-edged lobes over the chest
  meeting a high white collar, with a scalloped notch down the middle where
  the purple shows; a gold-and-purple neck ornament (a crowned crescent on a
  purple band, a gold diamond below); detached puffy white sleeves gathered
  at pink cuffs; white boots with a purple V at the top; long, loose silver
  hair with straight bangs, face-framing strands and pointed elf ears.

Parts (`<id>_part_<name>` meshes, see src/data/characters.ts `looks`):
  cloak      the long white cloak lined lavender, its raised shoulder mantle
             and the round gold clasp at the throat;
  hoodup     the hood worn up, with purple-tipped cat ears;
  hooddown   the hood down, bunched behind the neck and lying on the
             shoulders, its ears flopped back;
  hairback   the long back hair (it goes inside the hood when that's up);
  ornaments  the crown braid, the white flower, the coiled bun and its long
             purple ribbons (under the hood when that's up).
"""
from __future__ import annotations

import math

import bmesh
import bpy  # noqa: F401
from mathutils import Matrix, Vector
from mathutils.geometry import delaunay_2d_cdt

import accessories as acc
import roster as R
import tailor as t
from hair import Clump, HeadFrame
from humanoid import Joints
from outfit import Garments, ZoneContext, cape, ring_band, shoulder_collar
from party import arm_axis, cat_ear, hood_up, shoes, under_shoes, wrist_cuts

# Where the detached sleeves start, along the arm from the shoulder joint (fraction of H).
SLEEVE_START = 0.058
# The chest covering is laid out on an unrolled cylinder round the torso:
# (s, z) where z is height and s is distance round from the front centre
# (both fractions of H); s = WRAP_R * angle, so s = 0.078 is the side seam.
WRAP_R = 0.05
COLLAR_Z = 0.829
# Its top edge (the halter line): from the base of the collar down across
# the bare shoulders to just under the armpit.
HALTER = ((0.032, 0.826), (0.074, 0.746))


def halter_z(s: float) -> float:
    """Height (fraction of H) of the chest covering's top edge at |s|."""
    (s0, z0), (s1, z1) = HALTER
    s = abs(s)
    if s <= s0:
        return COLLAR_Z
    return z0 + (z1 - z0) * min(1.0, (s - s0) / (s1 - s0))


def torso_yc(j: Joints, z: float) -> float:
    """y of the torso's centre line at height z (the body's chest is a
    little in front of the spine joints, the neck base a little behind)."""
    zf = z / j.H
    return j.chest.y + (0.0015 + 0.035 * max(0.0, min(0.1, zf - 0.70))) * j.H


def wrap_s(j: Joints, p: Vector) -> float:
    """The unrolled s coordinate of a body point (fraction of H, signed by side)."""
    a = math.atan2(abs(p.x), torso_yc(j, p.z) - p.y)
    return math.copysign(WRAP_R * a, p.x)


# --------------------------------------------------------------------------- the chest covering


def _outline() -> list[tuple[float, float, str]]:
    """Closed outline of the chest covering in (s, z), counter-clockwise seen
    from the front, each point tagged with the edge it belongs to: from the
    base of the collar the halter line runs down to under the arm; the side
    swells into a large rounded lobe over the bust, its cloud-scalloped
    lower edge curling in towards the centre; up the middle, a narrow open
    strip where the purple shows, up to the ornament."""
    right: list[tuple[float, float, str]] = []
    (s0, z0), (s1, z1) = HALTER
    for k in range(6):
        a = k / 5 * math.radians(80)
        right.append((math.sin(a) * s0, COLLAR_Z - (1 - math.cos(a)) * (COLLAR_Z - z0) * 1.4, "top"))
    for k in range(1, 11):
        u = k / 10
        right.append((s0 + (s1 - s0) * u, z0 + (z1 - z0) * u, "top"))
    cs, cz, rs, rz = 0.041, 0.711, 0.034, 0.046
    t0, t1 = -0.04, -math.pi + 0.72
    # Down the side, easing out into the lobe.
    sx, sz = cs + rs * math.cos(t0), cz + rz * math.sin(t0)
    for k in range(1, 6):
        u = k / 5
        right.append((s1 + (sx - s1) * u + 0.003 * math.sin(u * math.pi), z1 + (sz - z1) * u, "lobe"))
    # The lobe: a big rounded arc under the bust, scalloped like a cloud,
    # curling up and in towards the centre.
    n = 44
    for k in range(1, n + 1):
        u = k / n
        ang = t0 + (t1 - t0) * u
        bump = 1 + 0.1 * abs(math.sin(u * 4 * math.pi)) ** 0.55
        right.append((cs + rs * bump * math.cos(ang), cz + rz * bump * math.sin(ang), "lobe"))
    xs, zs, _ = right[-1]
    for k in range(1, 5):
        u = k / 4
        right.append((xs + (0.0125 - xs) * math.sin(u * math.pi / 2), zs + (0.701 - zs) * u, "lobe"))
    # The open strip, narrowing a little towards the ornament.
    for k in range(1, 13):
        u = k / 12
        right.append((0.0085 + 0.004 * (1 - u) ** 2, 0.701 + (0.794 - 0.701) * u, "notch"))
    left = [(-x, z, tag) for (x, z, tag) in reversed(right[1:])]
    pts = right + left
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if area < 0:
        pts.reverse()
    return pts


def _inside(pts, x, z) -> bool:
    c = False
    n = len(pts)
    for i in range(n):
        x1, z1 = pts[i][0], pts[i][1]
        x2, z2 = pts[(i + 1) % n][0], pts[(i + 1) % n][1]
        if (z1 > z) != (z2 > z) and x < x1 + (z - z1) * (x2 - x1) / (z2 - z1):
            c = not c
    return c


def _edge_dist(pts, x, z) -> float:
    best = 1e9
    n = len(pts)
    for i in range(n):
        ax, az = pts[i][0], pts[i][1]
        bx, bz = pts[(i + 1) % n][0], pts[(i + 1) % n][1]
        dx, dz = bx - ax, bz - az
        L = dx * dx + dz * dz
        u = 0.0 if L < 1e-12 else max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L))
        px, pz = ax + dx * u, az + dz * u
        best = min(best, math.hypot(x - px, z - pz))
    return best


def _wrap_point(j: Joints, s: float, z: float):
    """The torso surface at unrolled (s, z) (fractions of H), cast outwards
    from the torso's centre line so it never lands on an arm; returns
    (point, outward horizontal direction)."""
    H = j.H
    a = s / WRAP_R
    d = Vector((math.sin(a), -math.cos(a), 0.0))
    # Under the arm the A-posed body joins torso to arm in a web; a ray
    # through it would land on the arm, so step down until it meets the
    # torso's side and keep that depth.
    for k in range(8):
        zz = (z - 0.003 * k) * H
        c = Vector((0.0, torso_yc(j, zz), zz))
        hit = t.surface_point(j, c, d)
        if hit is not None and abs(hit[0].x) < 0.062 * H:
            return Vector((hit[0].x, hit[0].y, z * H)), d
    return Vector((0.0, torso_yc(j, z * H), z * H)) + d * 0.05 * H, d


def _taubin(bm, verts, fixed, iterations: int = 6) -> None:
    """Smooth a patch without shrinking it (Taubin lambda/mu)."""
    nbrs = {v: [e.other_vert(v) for e in v.link_edges] for v in verts}
    for _ in range(iterations):
        for f in (0.5, -0.53):
            moved = {}
            for v in verts:
                if v in fixed or not nbrs[v]:
                    continue
                avg = sum((w.co for w in nbrs[v]), Vector()) / len(nbrs[v])
                moved[v] = v.co + (avg - v.co) * f
            for v, co in moved.items():
                v.co = co


def chest_cover(name: str, j: Joints, mat) -> bpy.types.Object:
    """The white chest covering, a raised garment layer over the bodysuit:
    the outline triangulated with a fine interior grid on the unrolled
    torso, wrapped round the chest to the side seams, and lifted into two
    padded lobes that stand well off the bust (about 3.5 cm), finished all
    round with a soft rolled edge — thick under the scalloped lobes, slim
    along the halter line and the open strip up the middle."""
    H = j.H
    outline = _outline()
    pts2 = [Vector((x, z)) for x, z, _ in outline]
    step = 0.004
    for xi in range(-21, 22):
        for zi in range(0, 48):
            x, z = xi * step, 0.656 + zi * step
            if _inside(outline, x, z) and _edge_dist(outline, x, z) > step * 0.45:
                pts2.append(Vector((x, z)))
    face = list(range(len(outline)))
    verts2, _edges, tris, orig, *_ = delaunay_2d_cdt(pts2, [], [face], 1, 1e-7)
    out_of = {}
    for k, ins in enumerate(orig):
        for i in ins:
            out_of[i] = k
    edge_lift = 0.0055 * H
    bm = bmesh.new()
    vs, dirs, lifts = [], [], []
    for v2 in verts2:
        p, d = _wrap_point(j, v2.x, v2.y)
        vs.append(bm.verts.new(p))
        dirs.append(d)
        # Padded: from its rolled edge it rises into a full, rounded pillow
        # over each side of the chest.
        puff = t.smoothstep(0.0, 0.03, _edge_dist(outline, v2.x, v2.y)) ** 0.6
        lifts.append(edge_lift + 0.017 * H * puff)
    for tri in tris:
        try:
            bm.faces.new([vs[i] for i in tri])
        except ValueError:
            pass
    # Smooth the sampled body surface (its facets) before lifting it off.
    ring = [vs[out_of[i]] for i in range(len(outline))]
    boundary = set(ring)
    _taubin(bm, vs, boundary, 4)
    bm.normal_update()
    for v, d, lift in zip(vs, dirs, lifts):
        # Out from the torso, tipped up or down with the slope of the chest.
        n = v.normal if v.normal.dot(d) > 0 else -v.normal
        off = (d + Vector((0, 0, max(-0.6, min(0.6, n.z))))).normalized()
        v.co = v.co + off * lift
    _taubin(bm, vs, boundary, 3)
    bm.normal_update()
    centre = Vector((0, j.chest.y, 0.72 * H))
    if sum(f.normal.dot(f.calc_center_median() - centre) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    surface = set(bm.faces)
    # The rolled edge along the whole outline, sitting on the bodysuit.
    ring_pts, ups, radii = [], [], []
    for (x, z, tag), v in zip(outline + [outline[0]], ring + [ring[0]]):
        _p, d = _wrap_point(j, x, z)
        ring_pts.append(v.co.copy())
        ups.append(d)
        r = (0.0068 if tag == "lobe" else 0.0045) * H
        radii.append((r, r * 0.95))
    # Ease the radius where the thick lobe edge meets the slim ones.
    soft = []
    m = len(radii) - 1
    for i in range(len(radii)):
        rr = [radii[(i + k) % m][0] for k in range(-3, 4)]
        r = sum(rr) / len(rr)
        soft.append((r, r * 0.95))
    t.tube_along(bm, ring_pts, soft, ups, ring=10, cap=False)
    rim = [f for f in bm.faces if f not in surface]
    bmesh.ops.recalc_face_normals(bm, faces=rim)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    t.skin_like_body(obj, j)
    return obj


def high_collar(name: str, j: Joints, mat) -> bpy.types.Object:
    """A white stand-up collar round the neck, rising from the chest covering."""
    H = j.H
    z = j.neck_base.z + 0.012 * H
    f = t.front_point(j, 0.0, z, 0.0)
    b = t.front_point(j, 0.0, z, 0.0, side=1.0)
    yf = f[0].y if f else j.neck_base.y - 0.04 * H
    yb = b[0].y if b else j.neck_base.y + 0.04 * H
    sp = t.surface_point(j, Vector((0.5, (yf + yb) / 2, z)), Vector((-1, 0, 0)))
    rx = (sp[0].x if sp else 0.036 * H) + 0.0035 * H
    ry = (yb - yf) / 2 + 0.0035 * H
    c = ring_band(name, Vector((0, (yf + yb) / 2, j.neck_base.z - 0.008 * H)), rx, ry, 0.03 * H, 0.06, mat, segments=40, thickness=0.003 * H)
    t.skin_like_body(c, j)
    return c


def _plate_from_outline(name: str, outline: list[tuple[float, float]], depth: float, mat) -> bpy.types.Object:
    """A flat plate (local X right, Z up, facing -Y) from a 2D outline, given depth."""
    bm = bmesh.new()
    front = [bm.verts.new(Vector((x, 0, z))) for x, z in outline]
    f = bm.faces.new(front)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=Vector((0, depth, 0)))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
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


def neck_ornament(j: Joints, gold, purple) -> list[bpy.types.Object]:
    """The layered ornament at the base of the collar, between the neck and
    the chest covering: a broad gold crescent frame sweeping up into horns,
    with a crown point at its centre; a purple inlay set into it; and below,
    a gold diamond pendant with a purple stone."""
    H = j.H
    hit = t.front_point(j, 0.0, j.neck_base.z - 0.008 * H, 0.0)
    if hit is None:
        return []
    p, n = hit
    n = Vector((n.x * 0.2, n.y, n.z * 0.35)).normalized()
    base = p + n * 0.012 * H
    out = []
    # Gold frame (the back layer, thick).
    frame = _plate_from_outline("emilia_neck_frame", [(x * H, z * H) for x, z in _crescent(0.047, -0.013, -0.002, 0.016, 0.018)], 0.006 * H, gold)
    _place(frame, base, n)
    out.append(frame)
    # Purple inlay set into it, leaving a gold rim all round.
    inlay = _plate_from_outline("emilia_neck_inlay", [(x * H, z * H) for x, z in _crescent(0.038, -0.0095, -0.0035, 0.0105, 0.0)], 0.0025 * H, purple)
    _place(inlay, base + n * 0.0016 * H + Vector((0, 0, 0.0006 * H)), n)
    out.append(inlay)
    # A small gold boss at the centre of the crown point.
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.0048 * H, v.co.y * 0.0028 * H, v.co.z * 0.0048 * H))
    boss = acc._obj("emilia_neck_boss", bm, gold)
    _place(boss, base + n * 0.0035 * H + Vector((0, 0, 0.004 * H)), n)
    out.append(boss)
    # The pendant: a gold diamond with a purple stone.
    pend = _plate_from_outline("emilia_neck_pendant", [(x * H, z * H) for x, z in _rhombus(0.0095, 0.016)], 0.005 * H, gold)
    _place(pend, base + Vector((0, 0, -0.032 * H)) + n * 0.002 * H, n)
    out.append(pend)
    stone = _plate_from_outline("emilia_neck_stone", [(x * H, z * H) for x, z in _rhombus(0.0055, 0.0095)], 0.0025 * H, purple)
    _place(stone, base + Vector((0, 0, -0.032 * H)) + n * 0.0042 * H, n)
    out.append(stone)
    # A short gold link from the frame down to the pendant.
    link = _plate_from_outline("emilia_neck_link", [(-0.0018 * H, -0.004 * H), (0.0018 * H, -0.004 * H), (0.0018 * H, 0.004 * H), (-0.0018 * H, 0.004 * H)], 0.003 * H, gold)
    _place(link, base + Vector((0, 0, -0.0175 * H)) + n * 0.0015 * H, n)
    out.append(link)
    for o in out:
        t.skin_like_body(o, j)
    return out


def cloak_clasp(j: Joints, gold, inset) -> list[bpy.types.Object]:
    """The cloak's round gold clasp at the throat, a little gold diamond below."""
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
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=0, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.006 * H, v.co.y * 0.003 * H, v.co.z * 0.009 * H))
    dia = acc._obj("emilia_clasp_diamond", bm, gold, smooth=False)
    _place(dia, p + n * 0.024 * H + Vector((0, 0, -0.024 * H)), n)
    out.append(dia)
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


# --------------------------------------------------------------------------- spec


def emilia_arc6():
    spec = R.emilia()
    spec.head.elf_ear = 1.6
    spec.head.elf_out = 1.0
    # Her ears stand out of her hair — and go under the hood when it's up.
    spec.ear_part = "elfears"

    # ---- Hair: straight, even bangs; long face-framing strands in front
    # of the ears; a smooth crown; long back hair in broad, layered groups.
    spec.head.ear = 1.12
    clumps = []
    for i, az in enumerate((-56, -44, -32, -20, -8, 4, 16, 28, 40, 52)):
        side = math.sin(math.radians(az))
        edge = abs(az) > 45
        clumps.append(Clump(az=az, el=58, direction=(side * 0.2, -0.9, -0.5), length=0.7 if edge else 0.64, width=0.34, thickness=0.085, stiffness=0.38, gravity=1.2, lift=0.01, hold=0.62, tip=2.2))
    for az in (-69, 69):
        clumps.append(Clump(az=az, el=34, direction=(math.copysign(0.16, az), -0.4, -1.0), length=2.1, width=0.3, thickness=0.09, stiffness=0.3, gravity=1.3, lift=0.012, chain=f"hair_side{'L' if az > 0 else 'R'}"))
    for az in (-61, 61):
        clumps.append(Clump(az=az, el=46, direction=(math.copysign(0.1, az), -0.55, -1.0), length=1.15, width=0.26, thickness=0.085, stiffness=0.35, gravity=1.2, lift=0.01))
    # The crown: hair flows smoothly from the top of the head down over it.
    for az in range(0, 360, 30):
        a = math.radians(az)
        cl = Clump(az=az, el=80, direction=(math.sin(a) * 0.55, -math.cos(a) * 0.55 + 0.2, -0.6), length=0.6, width=0.48, thickness=0.09, stiffness=0.12, gravity=1.2, root_offset=0.003)
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

    # Back hair: three layers of broad locks at different depths, each
    # layer offset from the one beneath, lengths varied, alternate locks
    # curving a little in or out — groups, not a single sheet.
    layers = [
        # el, lift, width, azimuths and lengths
        (-12, 0.006, 0.5, [(110, 3.0), (140, 3.1), (170, 3.15), (200, 3.15), (230, 3.1), (250, 3.0)]),
        (10, 0.026, 0.52, [(129, 3.3), (151, 3.42), (171, 3.48), (189, 3.48), (209, 3.42), (231, 3.3)]),
        (32, 0.052, 0.54, [(118, 3.15), (140, 3.55), (162, 3.4), (180, 3.7), (198, 3.4), (220, 3.55), (242, 3.15)]),
    ]
    for li, (el, lift, width, locks) in enumerate(layers):
        for k, (az, ln) in enumerate(locks):
            a = math.radians(az)
            curl = (0.12 if k % 2 else -0.12) if li == 2 else 0.0
            clumps.append(Clump(az=az, el=el, direction=(math.sin(a) * 0.45, 0.75, -0.7), length=ln, width=width, thickness=0.1, stiffness=0.32, gravity=1.3, curl=curl, lift=lift + (0.008 if k % 2 else 0.0), hold=0.42, chain=chain_of(az), part="hairback"))
    spec.hair.clumps = clumps
    spec.hair.chains = {"hair_back0": 5, "hair_back1": 5, "hair_back2": 5, "hair_back3": 5, "hair_back4": 5, "hair_sideL": 4, "hair_sideR": 4}

    spec.palette.update({
        "hair": ("#dedaee", "hair"),
        "suit": ("#7656c0", "cloth"),
        "seam": ("#5a3d9c", "cloth"),
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

    def bare_shoulder(c: ZoneContext) -> bool:
        if c.on_arm():
            return c.arm_s() < (SLEEVE_START + 0.012) * c.H
        # The A-pose web joining torso to arm under the shoulder is armpit.
        if abs(c.p.x) > 0.056 * c.H and c.p.z > 0.722 * c.H:
            return True
        s = abs(wrap_s(c.j, c.p))
        return s > HALTER[0][0] + 0.004 and c.p.z > (halter_z(s) - 0.004) * c.H and c.p.y < c.j.chest.y + 0.035 * c.H

    spec.zones = R.skin_rules(bare_shoulder) + [
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= boots_top(c)),
        ("suit", lambda c: True),
    ]
    # A clean line round the top of the boots (the zone follows the cut).
    spec.cuts = lambda j: [(Vector((0, 0, j.knee_l.z + 0.05 * j.H)), Vector((0, 0, 1)))]
    spec.default_zone = "suit"

    def under_sleeves(c: ZoneContext) -> bool:
        return c.on_arm() and (SLEEVE_START + 0.014) * c.H < c.arm_s() < c.arm_len() - 0.03 * c.H

    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)

    def garments(j: Joints, m: dict) -> Garments:
        g = Garments()
        H = j.H
        # ---- Base outfit: complete without the cloak.
        g.objects.append(chest_cover("emilia_chest", j, m["chest"]))
        g.objects.append(high_collar("emilia_collar", j, m["chest"]))
        g.objects.extend(neck_ornament(j, m["gold"], m["ornament"]))
        # Detached sleeves: puffed from the upper arm, gathered at pink cuffs.
        cuts = list(wrist_cuts(j, 0.006))
        for s_ in (1, -1):
            a, w, d = arm_axis(j, s_)
            cuts.append((a + d * SLEEVE_START * H, -d))

        def sleeve_keep(c: ZoneContext) -> bool:
            return c.on_arm() and SLEEVE_START * H < c.arm_s() < c.arm_len() - 0.006 * H

        def sleeve_extra(p, n):
            side, s, length, d, radial = t.arm_frame(j, p)
            u = max(0.0, min(1.0, (s - SLEEVE_START * H) / max(1e-6, length - SLEEVE_START * H)))
            puff = 0.012 * H * math.sin(math.pi * u) ** 0.8
            bell = 0.006 * H * t.smoothstep(0.75, 1.0, u)
            return t.wrinkles(j, p, arm=0.9, seed=0.9) + puff + bell

        g.objects.append(t.shell("emilia_sleeves", j, sleeve_keep, 0.008, m["sleeve"], cuts=cuts, thickness=0.003, extra=sleeve_extra, subdivide=1))
        for s_ in (1, -1):
            a, w, d = arm_axis(j, s_)
            top = t.frill_ring(f"emilia_sleevetop{s_}", a + d * (SLEEVE_START + 0.004) * H, -d, 0.031 * H, 0.011 * H, m["sleeve"], waves=12, flare=0.25)
            t.skin_like_body(top, j)
            g.objects.append(top)
            g.objects.append(puffed_cuff(f"emilia_cuff{s_}", j, w - d * 0.022 * H, d, m["cuff"]))
        # The bodysuit's seam down the front.
        seam = t.vertical_trim("emilia_seam", j, 0.0, 0.5 * H, 0.688 * H, 0.0028, m["seam"], lift=0.0012)
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

        # ---- Part: the cloak (broad, flaring, lined lavender), its raised
        # shoulder mantle, and the clasp.
        cp, guides = cape("emilia_cloak", j, 0.17, 0.7, m["cloak"], chains=6, bones=4, wrap=238, folds=8, fold_depth=0.036, flare=1.0, fold2=(17, 0.012), hem_curve=0.09, edge_wave=0.024, thickness=0.011)
        cp["bone"] = "upperChest"
        cp["part"] = "cloak"
        cp.data.materials.append(m["lining"])
        for poly in cp.data.polygons:
            c = poly.center
            radial = Vector((c.x, c.y - j.chest.y, 0))
            if radial.length > 1e-6 and poly.normal.dot(radial.normalized()) < -0.15:
                poly.material_index = 1
        g.objects.append(cp)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"cape{i}"] = gl
            names.append(f"cape{i}")
        g.bindings[cp.name] = names
        mantle = shoulder_collar("emilia_cloak_mantle", j, m["cloak"], outer_x=0.132, outer_front=0.062, outer_back=0.094, flare=0.012, lift=0.026, slope=0.55, slope_back=1.25, open_front=math.radians(150), segments=72, thickness=0.014)
        mantle["bone"] = "upperChest"
        mantle["part"] = "cloak"
        g.objects.append(mantle)
        g.objects.extend(cloak_clasp(j, m["gold"], m["ornament"]))

        # ---- Part: the hood down, bunched behind the neck over the cloak,
        # its ears flopped back.
        hd = t.hood_down("emilia_hood_down", j, m["cloak"], size=1.14, over=cp)
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
        hood = hood_up("emilia_hood", f, m["cloak"], m["lining"], cowl=True)
        hood["part"] = "hoodup"
        out.append(hood)
        for s_ in (1, -1):
            a, e = math.radians(s_ * 40), math.radians(62)
            n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
            base = f.c + Vector((n.x * f.rw, n.y * f.rd, n.z * f.rh)) * 1.3
            for ear in cat_ear(f"emilia_ear{s_}", base, (n + Vector((0, 0, 0.8))).normalized(), 0.44 * f.H, m["cloak"], m["ear_tip"]):
                ear["part"] = "hoodup"
                out.append(ear)
        # ---- Part: hair ornaments.
        orn = []
        # Her left: a thin braid along the parting, ending at a white flower.
        pts = [f.surface(az, el, 0.05) for az, el in ((12, 67), (22, 64), (32, 60), (42, 56), (50, 52))]
        orn.append(acc.braid("emilia_crown_braid", pts, 0.02, m["hair"]))
        fp = f.surface(57, 49, 0.075)
        orn.append(acc.flower("emilia_flower", fp, (fp - f.c).normalized(), 0.05, 4, m["flower"], m["flower_c"], cup=0.3))
        # Her right: a coiled bun, with long purple ribbons hanging from it.
        bc = f.surface(-58, 47, 0.07)
        n = (bc - f.c).normalized()
        u = n.cross(Vector((0, 0, 1))).normalized()
        v = n.cross(u).normalized()
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
        for vv in bm.verts:
            vv.co = Vector((vv.co.x * 0.041, vv.co.y * 0.041, vv.co.z * 0.024))
        core = acc._obj("emilia_bun_core", bm, m["hair"])
        acc.orient(core, bc + n * 0.006, n)
        orn.append(core)
        coil = []
        for k in range(15):
            tt = k / 14
            ang = tt * 2 * math.pi * 1.75
            r = 0.043 * (1 - 0.78 * tt)
            coil.append(bc + (u * math.cos(ang) + v * math.sin(ang)) * r + n * (0.016 + 0.016 * tt))
        orn.append(acc.braid("emilia_bun", coil, 0.023, m["hair"]))
        # A purple tie round the bun's base.
        tie = []
        for k in range(25):
            ang = k / 24 * 2 * math.pi
            tie.append(bc + (u * math.cos(ang) + v * math.sin(ang)) * 0.042 + n * 0.006)
        orn.append(t.ribbon("emilia_bun_tie", tie, [n] * len(tie), 0.009, m["ribbon"], thickness=0.003, closed=True))
        for o in orn:
            o["part"] = "ornaments"
            out.append(o)
        guide = getattr(j, "hair_chains", {}).get("hair_sideR")
        start = bc - v * 0.026 + n * 0.006
        for i, (dx, dy, extra) in enumerate(((-0.012, 0.014, 0.09), (-0.004, 0.024, 0.13))):
            if guide and len(guide) >= 3:
                body = [q + Vector((dx, dy, 0)) for q in guide[1:]]
                tail_dir = (guide[-1] - guide[-2]).normalized()
                body.append(body[-1] + tail_dir * extra)
            else:
                body = [start + Vector((dx, dy, -0.08 * k)) for k in range(1, 6)]
            line = [start + Vector((dx * 0.4, dy * 0.3, 0))] + body
            nrm = [Vector((-1, 0.25, 0)).normalized()] * len(line)
            rib = t.ribbon(f"emilia_ribbon{i}", line, nrm, 0.014, m["ribbon"], thickness=0.0025)
            rib["chain"] = "hair_sideR"
            rib["part"] = "ornaments"
            out.append(rib)
        return out

    spec.garments = garments
    spec.accessories = accessories
    return spec

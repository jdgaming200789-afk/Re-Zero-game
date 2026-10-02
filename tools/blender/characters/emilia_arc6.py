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
# The chest covering's outline in front view, (x, z) as fractions of H.
COLLAR_Z = 0.829
HALTER = ((0.037, 0.826), (0.088, 0.758))


def halter_z(x_frac: float) -> float:
    """Height (fraction of H) of the chest covering's top edge at |x|."""
    (x0, z0), (x1, z1) = HALTER
    x = abs(x_frac)
    if x <= x0:
        return COLLAR_Z
    return z0 + (z1 - z0) * (x - x0) / (x1 - x0)


# --------------------------------------------------------------------------- the chest covering


def _outline() -> list[tuple[float, float]]:
    """Closed outline of the chest covering (fractions of H), counter-clockwise
    seen from the front: two rounded lobes with cloud-scalloped lower edges,
    a scalloped notch up the middle to just under the neck ornament."""
    right: list[tuple[float, float]] = []
    # Round the base of the collar.
    for k in range(6):
        a = k / 5 * math.radians(80)
        right.append((math.sin(a) * HALTER[0][0], COLLAR_Z - (1 - math.cos(a)) * (COLLAR_Z - HALTER[0][1]) * 1.4))
    # Halter line out to the armpit (shoulders stay bare).
    (x0, z0), (x1, z1) = HALTER
    for k in range(1, 9):
        u = k / 8
        right.append((x0 + (x1 - x0) * u, z0 + (z1 - z0) * u))
    # Down the side, filling out over the bust.
    for k in range(1, 6):
        u = k / 5
        right.append((x1 + 0.009 * math.sin(u * math.pi * 0.5), z1 - 0.05 * u))
    # The lobe's lower edge: an elliptical arc under the bust, with soft scallops.
    cx, cz, rx, rz = 0.058, 0.712, 0.04, 0.043
    t0, t1 = -0.12, -math.pi + 0.55
    n = 30
    for k in range(1, n + 1):
        u = k / n
        ang = t0 + (t1 - t0) * u
        bump = 1 + 0.075 * abs(math.sin(u * 5 * math.pi)) ** 0.6
        right.append((cx + rx * bump * math.cos(ang), cz + rz * bump * math.sin(ang)))
    # The notch: from between the lobes up to under the ornament, its edges
    # scalloped where the white rounds into it.
    xs, zs = right[-1]
    ztop = 0.793
    for k in range(1, 15):
        u = k / 14
        z = zs + (ztop - zs) * u
        base = xs + (0.004 - xs) * u ** 0.8
        bump = 0.0045 * abs(math.sin(u * 3 * math.pi)) ** 0.7 * (1 - u * 0.6)
        right.append((max(0.0025, base - bump), z))
    left = [(-x, z) for (x, z) in reversed(right[1:])]
    pts = right + left
    # Counter-clockwise for the triangulator.
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if area < 0:
        pts.reverse()
    return pts


def _inside(pts, x, z) -> bool:
    c = False
    n = len(pts)
    for i in range(n):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % n]
        if (z1 > z) != (z2 > z) and x < x1 + (z - z1) * (x2 - x1) / (z2 - z1):
            c = not c
    return c


def _edge_dist(pts, x, z) -> float:
    best = 1e9
    n = len(pts)
    for i in range(n):
        ax, az = pts[i]
        bx, bz = pts[(i + 1) % n]
        dx, dz = bx - ax, bz - az
        L = dx * dx + dz * dz
        u = 0.0 if L < 1e-12 else max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L))
        px, pz = ax + dx * u, az + dz * u
        best = min(best, math.hypot(x - px, z - pz))
    return best


def chest_cover(name: str, j: Joints, mat) -> bpy.types.Object:
    """The white chest covering: the outline triangulated with a fine
    interior grid, projected onto the body from the front and lifted into
    soft, padded lobes; its edge is turned under so it reads thick."""
    H = j.H
    outline = _outline()
    pts2 = [Vector(p) for p in outline]
    step = 0.0055
    for xi in range(-20, 21):
        for zi in range(0, 34):
            x, z = xi * step, 0.655 + zi * step
            if _inside(outline, x, z) and _edge_dist(outline, x, z) > step * 0.45:
                pts2.append(Vector((x, z)))
    face = list(range(len(outline)))
    verts2, _edges, tris, *_ = delaunay_2d_cdt(pts2, [], [face], 1, 1e-7)
    bm = bmesh.new()
    vs = []
    last = None
    for v2 in verts2:
        x, z = v2.x, v2.y
        hit = t.front_point(j, x * H, z * H, 0.0)
        if hit is None:
            hit = last
        p, nrm = hit
        last = hit
        d = _edge_dist(outline, x, z)
        # Padded: it rises from its edge into a soft pillow over each lobe.
        lift = (0.0065 + 0.0095 * t.smoothstep(0.0, 0.024, d)) * H
        vs.append(bm.verts.new(p + nrm * lift))
    for tri in tris:
        try:
            bm.faces.new([vs[i] for i in tri])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    # Facing out (forward).
    if sum(f.normal.y for f in bm.faces) > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.normal_update()
    # Turn the edge under, back towards the body: the piece has thickness.
    top_faces = list(bm.faces)
    edges = [e for e in bm.edges if e.is_boundary]
    key = lambda co: (round(co.x, 6), round(co.y, 6), round(co.z, 6))  # noqa: E731
    inward = {key(v.co): -v.normal.copy() for e in edges for v in e.verts}
    res = bmesh.ops.extrude_edge_only(bm, edges=edges)
    # Each new vertex starts on its source: tuck it back towards the body.
    for v in (g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)):
        n_in = inward.get(key(v.co))
        if n_in is not None:
            v.co = v.co + n_in * 0.0085 * H
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    # An open surface can come out of the recalculation inside-out: the
    # covering must face forward, away from the body.
    if sum(f.normal.y for f in top_faces if f.is_valid) > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
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


def neck_ornament(j: Joints, gold, purple) -> list[bpy.types.Object]:
    """The gold-and-purple ornament at the base of the collar: a crowned
    gold crescent on a purple band, and a gold diamond hanging below."""
    H = j.H
    hit = t.front_point(j, 0.0, j.neck_base.z - 0.006 * H, 0.0)
    if hit is None:
        return []
    p, n = hit
    n = Vector((n.x * 0.3, n.y, n.z * 0.3)).normalized()
    out = []

    def crescent(scale: float, peak: float) -> list[tuple[float, float]]:
        w = 0.036 * H * scale
        pts = []
        # Lower edge: a smile from horn to horn.
        for k in range(13):
            u = k / 12 * 2 - 1
            pts.append((u * w, (-0.010 + 0.019 * u * u) * H * scale))
        # Upper edge back across, rising to a crown point at the centre.
        for k in range(12, -1, -1):
            u = k / 12 * 2 - 1
            z = (-0.0015 + 0.0115 * u * u) * H * scale
            if abs(u) < 0.28:
                z += (0.28 - abs(u)) / 0.28 * peak * H * scale
            pts.append((u * w * 0.98, z))
        return pts

    band = _plate_from_outline("emilia_neck_band", crescent(1.34, 0.0), 0.003 * H, purple)
    _place(band, p + n * 0.006 * H + Vector((0, 0, -0.0065 * H)), n)
    out.append(band)
    cres = _plate_from_outline("emilia_neck_crescent", crescent(1.3, 0.012), 0.0045 * H, gold)
    _place(cres, p + n * 0.0095 * H, n)
    out.append(cres)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=0, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.0085 * H, v.co.y * 0.0035 * H, v.co.z * 0.014 * H))
    dia = acc._obj("emilia_neck_diamond", bm, gold, smooth=False)
    _place(dia, p + n * 0.009 * H + Vector((0, 0, -0.03 * H)), n)
    out.append(dia)
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


# --------------------------------------------------------------------------- spec


def emilia_arc6():
    spec = R.emilia()
    spec.head.elf_ear = 1.6
    spec.head.elf_out = 1.0
    # Her ears stand out of her hair — and go under the hood when it's up.
    spec.ear_part = "elfears"

    # ---- Hair: straight bangs, long face-framing strands in front of the
    # ears, a full crown, and long loose hair down the back (its own part).
    clumps = R.fringe([-58, -40, -22, -7, 7, 22, 40, 58], 57, 0.62, width=0.36, lengths=[0.74, 0.64, 0.6, 0.66, 0.66, 0.6, 0.64, 0.74])
    for az in (-70, 70):
        clumps.append(Clump(az=az, el=34, direction=(math.copysign(0.16, az), -0.4, -1.0), length=2.05, width=0.3, thickness=0.09, stiffness=0.3, gravity=1.3, lift=0.012, chain=f"hair_side{'L' if az > 0 else 'R'}"))
    for az in (-61, 61):
        clumps.append(Clump(az=az, el=46, direction=(math.copysign(0.1, az), -0.55, -1.0), length=1.15, width=0.26, thickness=0.085, stiffness=0.35, gravity=1.2, lift=0.01))
    # The crown: hair flows from the top of the head down over it (not a
    # ring of spikes standing out).
    for az in range(0, 360, 30):
        a = math.radians(az)
        cl = Clump(az=az, el=80, direction=(math.sin(a) * 0.55, -math.cos(a) * 0.55 + 0.2, -0.6), length=0.58, width=0.44, thickness=0.09, stiffness=0.12, gravity=1.2, root_offset=0.003)
        if 100 < az < 260:
            cl.part = "hairback"
        clumps.append(cl)
    for el in (24, -2):
        for az in range(112, 249, 17):
            ci = min(4, int((az - 112) / 137 * 5))
            a = math.radians(az)
            clumps.append(Clump(az=az, el=el, direction=(math.sin(a) * 0.35, 0.78, -0.7), length=3.4 * (0.94 if el < 0 else 1.0), width=0.44, thickness=0.1, stiffness=0.32, gravity=1.3, lift=0.03, chain=f"hair_back{ci}", part="hairback"))
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
        return abs(c.p.x) > 0.042 * c.H and c.p.z > (halter_z(c.p.x / c.H) - 0.004) * c.H and c.p.y < c.j.chest.y + 0.035 * c.H

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
            cf = t.ring_trim(f"emilia_cuff{s_}", j, w - d * 0.02 * H, d, 0.02, m["cuff"], lift=0.022)
            if cf:
                g.objects.append(cf)
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
            vt = t.trim(f"emilia_boot_trim{s_}", j, path, 0.011, m["boot_trim"], lift=0.003, closed=True)
            if vt:
                g.objects.append(vt)

        # ---- Part: the cloak (broad, flaring, lined lavender), its raised
        # shoulder mantle, and the clasp.
        cp, guides = cape("emilia_cloak", j, 0.165, 0.7, m["cloak"], chains=6, bones=4, wrap=236, folds=9, fold_depth=0.028, flare=0.85)
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
        mantle = shoulder_collar("emilia_cloak_mantle", j, m["cloak"], outer_x=0.128, outer_front=0.058, outer_back=0.1, flare=0.014, lift=0.018, slope=0.7, open_front=math.radians(150), segments=72)
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
        orn.append(acc.braid("emilia_crown_braid", pts, 0.016, m["hair"]))
        fp = f.surface(57, 49, 0.075)
        orn.append(acc.flower("emilia_flower", fp, (fp - f.c).normalized(), 0.042, 4, m["flower"], m["flower_c"], cup=0.3))
        # Her right: a coiled bun, with long purple ribbons hanging from it.
        bc = f.surface(-58, 47, 0.07)
        n = (bc - f.c).normalized()
        u = n.cross(Vector((0, 0, 1))).normalized()
        v = n.cross(u).normalized()
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
        for vv in bm.verts:
            vv.co = Vector((vv.co.x * 0.035, vv.co.y * 0.035, vv.co.z * 0.02))
        core = acc._obj("emilia_bun_core", bm, m["hair"])
        acc.orient(core, bc + n * 0.006, n)
        orn.append(core)
        coil = []
        for k in range(15):
            tt = k / 14
            ang = tt * 2 * math.pi * 1.75
            r = 0.037 * (1 - 0.78 * tt)
            coil.append(bc + (u * math.cos(ang) + v * math.sin(ang)) * r + n * (0.014 + 0.014 * tt))
        orn.append(acc.braid("emilia_bun", coil, 0.02, m["hair"]))
        # A purple tie round the bun's base.
        tie = []
        for k in range(25):
            ang = k / 24 * 2 * math.pi
            tie.append(bc + (u * math.cos(ang) + v * math.sin(ang)) * 0.036 + n * 0.005)
        orn.append(t.ribbon("emilia_bun_tie", tie, [n] * len(tie), 0.007, m["ribbon"], thickness=0.002, closed=True))
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
            rib = t.ribbon(f"emilia_ribbon{i}", line, nrm, 0.011, m["ribbon"], thickness=0.002)
            rib["chain"] = "hair_sideR"
            rib["part"] = "ornaments"
            out.append(rib)
        return out

    spec.garments = garments
    spec.accessories = accessories
    return spec

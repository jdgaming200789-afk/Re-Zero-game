"""Reid Astrea, the first Sword Saint — the shade that keeps Electra.

Long, wild crimson hair to the middle of his back with a stray ahoge; a
round black eyepatch with a white spiral over his left eye; a sharp-toothed
grin. Bare, heavily muscled chest. A red kimono robe slipped off his left
shoulder — the right sleeve on, the left half bunched over a black sash and
hanging at his hip — with a ragged, torn hem and a white crest on the
sleeve. White fundoshi, bare legs and red zori.
"""
from __future__ import annotations

import math

import bpy  # noqa: F401
from mathutils import Vector

from build import CharacterSpec
from hair import Clump, HairStyle
from head import HeadSpec
from humanoid import BodySpec, Joints
from outfit import Garments, SkirtSpec, ZoneContext, apron, skirt
import tailor as t


def reid_hair() -> HairStyle:
    c: list[Clump] = []
    # Crown: thick locks swept back and up.
    for az in range(0, 360, 22):
        a = math.radians(az)
        c.append(Clump(az=az, el=80, direction=(math.sin(a) * 0.7, -math.cos(a) * 0.6 + 0.55, 0.15), length=0.6, width=0.44, thickness=0.12, stiffness=0.55, gravity=0.6, root_offset=0.004, tip=2.0))
    # Fringe: spiky, pushed up and to the sides, a few falling across.
    for i, az in enumerate((-50, -32, -14, 4, 22, 40, 56)):
        side = math.sin(math.radians(az))
        up = 0.5 if i % 2 == 0 else -0.35
        c.append(Clump(az=az, el=60, direction=(side * 0.55, -0.6, up), length=0.62 + 0.12 * (i % 3), width=0.32, thickness=0.1, stiffness=0.75, gravity=0.6, curl=0.5 * (1 if az < 0 else -1), lift=0.02, tip=2.4, hold=0.25))
    c.append(Clump(az=-6, el=54, direction=(-0.15, -0.9, -0.55), length=0.8, width=0.16, thickness=0.06, stiffness=0.35, gravity=1.2, curl=0.7, tip=2.2))
    c.append(Clump(az=18, el=52, direction=(0.3, -0.9, -0.5), length=0.7, width=0.15, thickness=0.06, stiffness=0.35, gravity=1.2, curl=-0.7, tip=2.2))
    # Sides: jagged locks flaring past the ears.
    for az in (-74, -92, -110, 74, 92, 110):
        c.append(Clump(az=az, el=30, direction=(math.copysign(0.75, az), 0.25, -0.6), length=0.75, width=0.34, thickness=0.1, stiffness=0.6, gravity=0.8, lift=0.02, tip=2.3, hold=0.3))
    # The mane: long spiky locks down to mid-back, on spring chains.
    for row, el in enumerate((34, 12, -10)):
        for az in range(118 - row * 6, 243 + row * 6, 15):
            a = math.radians(az)
            ci = min(4, int((az - 112) / 140 * 5))
            spread = math.sin(a) * (0.55 + 0.25 * row)
            ln = 2.6 - row * 0.25 + 0.35 * math.sin(az * 0.37)
            c.append(Clump(az=az, el=el, direction=(spread, 0.75, -0.6 - 0.2 * row), length=ln, width=0.4, thickness=0.12, stiffness=0.45, gravity=1.1, curl=0.25 * math.sin(az * 0.5), lift=0.02 + 0.01 * row, tip=2.2, hold=0.3, chain=f"hair_back{ci}"))
    # Strays sticking out of the mane.
    for az, el, d in ((150, 50, (0.6, 0.6, 0.5)), (205, 46, (-0.65, 0.6, 0.45)), (180, 40, (0.1, 0.9, 0.35))):
        c.append(Clump(az=az, el=el, direction=d, length=0.55, width=0.22, thickness=0.08, stiffness=0.9, gravity=0.4, tip=2.4))
    # Ahoge.
    c.append(Clump(az=8, el=86, direction=(0.1, -0.35, 1.0), length=0.42, width=0.1, thickness=0.04, stiffness=0.7, curl=-2.8, tip=2.0))
    return HairStyle(clumps=c, hairline_front=0.46, chains={f"hair_back{i}": 4 for i in range(5)})


def reid_garments(j: Joints, m: dict) -> Garments:
    H = j.H
    g = Garments()
    nz = j.neck_base.z
    sash_z = j.waist.z - 0.012 * H

    # --- Robe, upper: right half only — over the right shoulder and down
    # the back diagonally to the left hip; the chest left open.
    def front_edge_x(z):
        return -0.05 * H - 0.12 * (nz - z)

    def back_edge_x(z):
        return 0.4 * (nz - z) - 0.01 * H

    def robe_keep(c):
        p = c.p
        if p.z < sash_z - 0.01 * H or p.z > nz + 0.012 * H:
            return False
        if c.on_arm():
            return p.x < 0 and c.arm_s() < 0.5 * c.arm_len()
        if p.y < 0:
            return p.x < front_edge_x(p.z)
        return p.x < back_edge_x(p.z)

    cuts = [
        (Vector((-0.05 * H, 0, nz)), Vector((1, 0, -0.12)).normalized()),
        (Vector((-0.01 * H, 0, nz)), Vector((1, 0, 0.4)).normalized()),
        (Vector((0, 0, sash_z - 0.01 * H)), Vector((0, 0, 1))),
    ]
    a = Vector((-j.arm_l.x, j.arm_l.y, j.arm_l.z))
    w = Vector((-j.wrist_l.x, j.wrist_l.y, j.wrist_l.z))
    arm_d = (w - a).normalized()
    cuts.append((a + arm_d * (w - a).length * 0.5, arm_d))

    def robe_extra(p, n):
        e = t.wrinkles(j, p, arm=0.6, waist=0.5, seed=0.4)
        if t.in_arm(j, p):
            side, s, length, d, radial = t.arm_frame(j, p)
            u = s / length
            # Wide kimono sleeve: billows out and sags below the arm.
            e += 0.018 * H * t.smoothstep(0.05, 0.5, u) + 0.03 * H * t.smoothstep(0.1, 0.5, u) * max(0.0, -n.z) ** 1.5
        return e

    g.objects.append(t.shell("reid_robe_top", j, robe_keep, 0.01, m["robe"], cuts=cuts, thickness=0.005, extra=robe_extra, subdivide=1))
    # Collar band (eri) along the open edge: up the right front, round the back of the neck, down the back.
    path = []
    for i in range(14):
        z = sash_z + (nz - 0.004 * H - sash_z) * i / 13
        path.append((Vector((front_edge_x(z) + 0.012 * H, -1.0, z)), Vector((0, 1, 0))))
    for i in range(9):
        aa = math.radians(-100 + 200 * i / 8)
        path.append((Vector((math.sin(aa) * 0.3 * H, j.neck_base.y + math.cos(aa) * 0.3 * H, nz - 0.004 * H)), Vector((-math.sin(aa), -math.cos(aa), 0))))
    for i in range(14):
        z = nz - 0.004 * H - (nz - sash_z) * i / 13
        path.append((Vector((back_edge_x(z) - 0.012 * H, 1.0, z)), Vector((0, -1, 0))))
    eri = t.trim("reid_eri", j, path, 0.026, m["robe_dark"], lift=0.0175, thickness=0.004)
    if eri:
        g.objects.append(eri)
    # The crest on the sleeve.
    mid = a + arm_d * (w - a).length * 0.22
    up = (Vector((0, 0, 1)) - arm_d * arm_d.z).normalized()
    out = (up + Vector((-0.6, 0, 0))).normalized()
    crest = [((0.5 + 0.45 * math.cos(2 * math.pi * k / 12), 0.5 + 0.45 * math.sin(2 * math.pi * k / 12)), (0.5 + 0.45 * math.cos(2 * math.pi * (k + 1) / 12), 0.5 + 0.45 * math.sin(2 * math.pi * (k + 1) / 12))) for k in range(12)]
    crest += [((0.5, 0.12), (0.5, 0.88)), ((0.24, 0.62), (0.76, 0.62)), ((0.3, 0.3), (0.5, 0.12)), ((0.7, 0.3), (0.5, 0.12))]
    em = t.glyph("reid_crest", j, mid + out * 0.4 * H, -out, crest, 0.07, 0.008, m["crest"], lift=0.032)
    if em:
        g.objects.append(em)

    # --- Robe, lower: wraps the hips from the sash to the knee, open at the
    # front over the fundoshi, the hem torn into points.
    sk, guides = skirt("reid_robe_skirt", j, SkirtSpec(top_z=sash_z / H + 0.004, length=0.25, top_rx=0.088, top_ry=0.07, flare=1.42, folds=7, fold_depth=0.1, open_front=math.radians(64), chain_count=8, chain_bones=3), m["robe"])
    t.tatter_hem(sk, j, sash_z + 0.004 * H, 0.25 * H, 0.06, teeth=19, seed=0.3)
    g.objects.append(sk)
    names = []
    for i, gl in enumerate(guides):
        g.chains[f"skirt{i}"] = gl
        names.append(f"skirt{i}")
    g.bindings[sk.name] = names
    # The slipped-off left half: fabric bunched over the sash on the left
    # and back, and the empty left sleeve hanging down the hip.
    import bmesh

    bm = bmesh.new()
    pts, radii, ups = [], [], []
    for i in range(15):
        az = math.radians(35 + 170 * i / 14)  # front-left, round the left side to the back
        x = math.sin(az) * 0.105 * H
        y = j.waist.y - math.cos(az) * 0.085 * H
        z = sash_z + 0.03 * H + 0.008 * H * math.sin(i * 1.3)
        pts.append(Vector((x, y, z)))
        r = 0.022 * H * (0.7 + 0.3 * math.sin(math.pi * i / 14))
        radii.append((r, r * 1.2))
        ups.append(Vector((0, 0, 1)))
    t.tube_along(bm, pts, radii, ups, ring=10)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("reid_robe_bunch")
    bm.to_mesh(me)
    bm.free()
    bunch = bpy.data.objects.new("reid_robe_bunch", me)
    bpy.context.scene.collection.objects.link(bunch)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(m["robe"])
    t.skin_like_body(bunch, j)
    g.objects.append(bunch)
    slv, sguides = skirt("reid_empty_sleeve", j, SkirtSpec(top_z=sash_z / H + 0.02, length=0.2, top_rx=0.11, top_ry=0.09, flare=1.25, folds=3, fold_depth=0.08, open_front=math.radians(250), chain_count=2, chain_bones=3), m["robe"])
    # Keep only the arc hanging at the left hip (open_front leaves 110°: rotate it there).
    import mathutils

    slv.data.transform(mathutils.Matrix.Rotation(math.radians(-80), 4, "Z"))
    t.tatter_hem(slv, j, sash_z + 0.02 * H, 0.2 * H, 0.045, teeth=7, seed=1.1)
    g.objects.append(slv)
    snames = []
    for i, gl in enumerate(sguides):
        gl = [mathutils.Matrix.Rotation(math.radians(-80), 3, "Z") @ p for p in gl]
        g.chains[f"robe{i}"] = gl
        snames.append(f"robe{i}")
    slv["bone"] = "hips"
    g.bindings[slv.name] = snames

    # --- Black sash, knotted at the left front, ends hanging.
    sash = t.ring_trim("reid_sash", j, Vector((0, j.waist.y, sash_z)), Vector((0, 0, 1)), 0.055, m["sash"], lift=0.026)
    if sash:
        g.objects.append(sash)
    knot = t.plate("reid_sash_knot", j, Vector((0.06 * H, -1.0, sash_z)), Vector((0, 1, 0)), (0.045, 0.04, 0.02), m["sash"], lift=0.04, spin=0.4, bevel=0.45)
    if knot:
        g.objects.append(knot)
    ends, eguides = apron("reid_sash_ends", j, sash_z / H - 0.015, 0.13, 0.04, m["sash"])
    ends.data.transform(mathutils.Matrix.Translation(Vector((0.062 * H, -0.005 * H, 0))))
    g.objects.append(ends)
    g.chains["robe_sash"] = [p + Vector((0.062 * H, -0.005 * H, 0)) for p in eguides[0]]
    g.bindings[ends.name] = ["robe_sash"]

    # --- Fundoshi: the front flap.
    flap, fguides = apron("reid_fundoshi_flap", j, sash_z / H - 0.03, 0.12, 0.07, m["fundoshi"])
    g.objects.append(flap)
    g.chains["apron0"] = fguides[0]
    g.bindings[flap.name] = ["apron0"]

    # --- Red zori.
    for side in (1, -1):
        g.objects.append(t.sandal(f"reid_zori{side}", j, side, m["zori_sole"], m["zori_strap"]))
    return g


def reid() -> CharacterSpec:
    body = BodySpec(height=1.86, heads_tall=7.3, shoulder=1.24, hips=0.92, waist=0.94, chest=1.12, limb=1.08, sleeve=1.0, sleeve_cuff=1.0, torso_cloth=1.0, trouser=0.86, trouser_cuff=0.85, shoe=0.85, leg_length=1.08, extra={"muscle": 1.45})

    def fundoshi(c: ZoneContext) -> bool:
        if c.on_arm():
            return False
        if not (c.j.hip_l.z - 0.06 * c.H < c.p.z < c.j.waist.z - 0.012 * c.H):
            return False
        # Narrow at the front and back, a band over the hips.
        band = c.p.z > c.j.waist.z - 0.04 * c.H
        pouch = abs(c.p.x) < 0.045 * c.H + (c.p.z - c.j.hip_l.z) * 0.6
        return band or pouch

    rules = [
        ("fundoshi", fundoshi),
        ("skin", lambda c: True),
    ]
    return CharacterSpec(
        id="reid",
        body=body,
        head=HeadSpec(width=0.83, jaw=0.48, chin_point=0.4, cheek=0.06, nose=1.0),
        hair=reid_hair(),
        palette={
            "skin": ("#e8c2a2", "skin"),
            "face": ("#e8c2a2", "face"),
            "hair": ("#c4222b", "hair"),
            "robe": ("#b5212a", "cloth"),
            "robe_dark": ("#7e1520", "cloth"),
            "crest": ("#f4efe6", "cloth"),
            "sash": ("#1b1a1f", "cloth"),
            "fundoshi": ("#f2efe8", "cloth"),
            "zori_sole": ("#6b2a22", "cloth"),
            "zori_strap": ("#d0262f", "cloth"),
        },
        zones=rules,
        default_zone="skin",
        face={"eyeShape": "sharp"},
        garments=reid_garments,
        meta={"name": "Reid Astrea"},
    )

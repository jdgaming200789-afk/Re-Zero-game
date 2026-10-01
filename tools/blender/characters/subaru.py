"""Natsuki Subaru — two costumes on one body, head and hair.

  subaru            Arc 6 travelling clothes (the Pleiades Watchtower): a
                    dark grey hooded cloak worn hood-down, a green jacket
                    open over a beige button-up shirt, a brown belt, an
                    orange scarf, loose dark trousers and brown lace-up boots.
  subaru_tracksuit  the tracksuit from his first day in Lugunica: white
                    chest panel and zip, charcoal yoke and sleeves, orange
                    piping, cuffs and inner collar, a black tee at the open
                    neck, the "N" on the left chest, drawstring hem, striped
                    trousers and black-and-orange trainers.

Eyes: Subaru's small-irised, three-white "villain" eyes, amber-brown.
"""
from __future__ import annotations

import math

import bpy  # noqa: F401
from mathutils import Vector

from build import CharacterSpec
from hair import Clump, HairStyle
from head import HeadSpec
from humanoid import BodySpec, Joints
from outfit import Garments, ZoneContext, cape, ring_band
import tailor as t

FACE = {"eyeShape": "sharp"}


# --------------------------------------------------------------------------- hair


def subaru_hair() -> HairStyle:
    """Short black hair: a heavy fringe of pointed locks down to the brows,
    parted a little left of centre, locks in front of the ears, a spiky
    layered back that flicks out at the nape and a couple of strays on top."""
    c: list[Clump] = []
    # Crown volume, flowing back and down from the whorl.
    for az in range(0, 360, 24):
        a = math.radians(az)
        c.append(Clump(az=az, el=78, direction=(math.sin(a) * 0.8, -math.cos(a) * 0.8 + 0.4, -0.1), length=0.5, width=0.44, thickness=0.11, stiffness=0.3, gravity=0.8, root_offset=0.004))
    # Fringe: pointed locks, varied lengths, a part over the left brow.
    fr = [(-58, 0.56, 0.3), (-44, 0.6, 0.32), (-30, 0.64, 0.34), (-15, 0.58, 0.33), (-2, 0.66, 0.32), (12, 0.5, 0.28), (25, 0.62, 0.33), (40, 0.6, 0.32), (55, 0.56, 0.3)]
    for i, (az, ln, w) in enumerate(fr):
        side = math.sin(math.radians(az))
        sweep = 0.16 if az < 6 else -0.22  # locks fall away from the part
        c.append(Clump(az=az, el=60, direction=(side * 0.25 + sweep, -0.85, -0.5), length=ln, width=w, thickness=0.085, stiffness=0.38, gravity=1.15, curl=0.3 * (1 if az < 6 else -1), lift=0.012, tip=2.3, hold=0.3, twist=0.15 * (1 if i % 2 else -1)))
    # Under-layer to close the gaps between fringe locks.
    for az in (-48, -24, 0, 22, 46):
        c.append(Clump(az=az, el=54, direction=(0, -0.9, -0.45), length=0.4, width=0.34, thickness=0.08, stiffness=0.3, gravity=1.2, lift=0.006, tip=1.8))
    # Locks in front of and over the ears.
    for az in (-70, 70):
        c.append(Clump(az=az, el=36, direction=(math.copysign(0.12, az), -0.3, -1), length=0.6, width=0.27, thickness=0.08, stiffness=0.35, gravity=1.2, lift=0.012, tip=2.2, hold=0.3, curl=0.4 * (1 if az < 0 else -1)))
    for az in (-92, -106, 92, 106):
        c.append(Clump(az=az, el=32, direction=(math.copysign(0.12, az), 0.25, -1), length=0.42, width=0.3, thickness=0.09, stiffness=0.4, lift=0.008, tip=2.0))
    # Back: two layers of spikes pointing down and out, flicking at the nape.
    for az in range(116, 246, 16):
        a = math.radians(az)
        c.append(Clump(az=az, el=30, direction=(math.sin(a) * 0.55, 0.85, -0.5), length=0.56, width=0.34, thickness=0.1, stiffness=0.6, gravity=0.9, lift=0.014, tip=2.1, hold=0.3))
    for az in range(128, 236, 18):
        a = math.radians(az)
        c.append(Clump(az=az, el=0, direction=(math.sin(a) * 0.6, 0.55, -0.85), length=0.4, width=0.3, thickness=0.09, stiffness=0.7, gravity=0.6, lift=0.012, tip=2.2, curl=-0.6))
    # Strays sticking up and back from the crown.
    c.append(Clump(az=168, el=66, direction=(0.15, 0.85, 0.55), length=0.34, width=0.2, thickness=0.07, stiffness=0.9, tip=2.4))
    c.append(Clump(az=198, el=62, direction=(-0.3, 0.8, 0.5), length=0.3, width=0.18, thickness=0.07, stiffness=0.9, tip=2.4))
    c.append(Clump(az=-8, el=84, direction=(-0.1, -0.2, 1.0), length=0.2, width=0.07, thickness=0.03, stiffness=0.6, curl=-2.4, tip=2.0))
    return HairStyle(clumps=c, hairline_front=0.46)


# --------------------------------------------------------------------------- body


def subaru_body() -> BodySpec:
    return BodySpec(height=1.73, heads_tall=6.5, shoulder=1.1, hips=0.96, waist=0.94, chest=1.04, limb=1.0, sleeve=1.04, sleeve_cuff=1.0, trouser=1.1, trouser_cuff=1.1, torso_cloth=1.0, shoe=0.7, leg_length=1.05)


def subaru_head() -> HeadSpec:
    return HeadSpec(width=0.85, jaw=0.4, chin_point=0.32, cheek=0.12, nose=0.85)


def is_neck(c: ZoneContext) -> bool:
    return c.p.z > c.j.neck_base.z + 0.004 * c.H


def wrist_cut(j: Joints, back: float):
    """Planes across both forearms `back` (fraction of H) short of the wrist."""
    out = []
    for side in (1, -1):
        a = Vector((j.arm_l.x * side, j.arm_l.y, j.arm_l.z))
        w = Vector((j.wrist_l.x * side, j.wrist_l.y, j.wrist_l.z))
        d = (w - a).normalized()
        out.append((w - d * back * j.H, d))
    return out


def before_wrist(c: ZoneContext, back: float) -> bool:
    if not c.on_arm():
        return True
    return c.arm_s() < c.arm_len() - back * c.H


def legs_below(c: ZoneContext, z: float) -> bool:
    return (not c.on_arm()) and c.p.z < z


# --------------------------------------------------------------------------- Arc 6


def arc6_garments(j: Joints, m: dict) -> Garments:
    H = j.H
    g = Garments()
    hem_z = j.pelvis.z + 0.012 * H
    boot_z = 0.205 * H
    knee = j.knee_l.z

    # Loose trousers: waist to the boot tops, bunching where they tuck in.
    def trouser_keep(c):
        return (not c.on_arm()) and boot_z - 0.03 * H < c.p.z < j.waist.z - 0.005 * H and abs(c.p.x) > 0.002 * H

    def trouser_extra(p, n):
        tuck = math.exp(-(((p.z - (boot_z + 0.01 * H)) / (0.035 * H)) ** 2)) * 0.008 * H
        return t.wrinkles(j, p, leg=1.0, seed=0.7) + tuck

    g.objects.append(t.shell("subaru_trousers", j, trouser_keep, 0.006, m["trousers"], cuts=[(Vector((0, 0, boot_z - 0.03 * H)), Vector((0, 0, 1))), (Vector((0, 0, j.waist.z - 0.005 * H)), Vector((0, 0, 1)))], thickness=0.003, extra=trouser_extra, subdivide=1))

    # Boots: a laced shaft to mid-calf over a modelled foot.
    def boot_keep(c):
        return (not c.on_arm()) and j.ankle_l.z - 0.02 * H < c.p.z < boot_z and abs(c.p.x) > 0.01 * H

    def boot_extra(p, n):
        top = 1 - t.smoothstep(0.0, 0.03 * H, boot_z - p.z)
        return 0.004 * H * top

    g.objects.append(t.shell("subaru_boot_shafts", j, boot_keep, 0.013, m["boot"], cuts=[(Vector((0, 0, boot_z)), Vector((0, 0, 1)))], thickness=0.004, extra=boot_extra))
    for side in (1, -1):
        g.objects.append(t.shoe(f"subaru_boot{side}", j, side, m["boot"], m["sole"], length=1.32, width=1.12, height=1.15, sole=0.014, collar=0.08, mat_toe=m["boot_toe"]))
        x = j.ankle_l.x * side
        # Turned-down cuff at the top of the shaft.
        cuff = t.ring_trim(f"subaru_bootcuff{side}", j, Vector((x, j.ankle_l.y + 0.004 * H, boot_z - 0.006 * H)), Vector((0, 0, 1)), 0.016, m["boot_toe"], lift=0.019)
        if cuff:
            g.objects.append(cuff)
        # Laces: eyelets up the front and a criss-cross.
        eyelets = []
        lace_path = []
        n = 6
        for i in range(n):
            z = j.ankle_l.z + 0.008 * H + (boot_z - 0.02 * H - j.ankle_l.z) * i / (n - 1)
            for s in (-1, 1):
                ox = x + s * 0.011 * H
                eyelets.append((Vector((ox, -1.0, z)), Vector((0, 1, 0))))
            zl = z + (boot_z - 0.02 * H - j.ankle_l.z) / (n - 1) * 0.5
            if i < n - 1:
                lace_path += [(Vector((x - 0.011 * H, -1.0, z)), Vector((0, 1, 0))), (Vector((x + 0.011 * H, -1.0, zl)), Vector((0, 1, 0)))]
        st = t.studs(f"subaru_eyelets{side}", j, eyelets, 0.0028, m["buckle"], lift=0.018)
        if st:
            g.objects.append(st)
        lc = t.trim(f"subaru_laces{side}", j, lace_path, 0.0035, m["lace"], lift=0.0185)
        if lc:
            g.objects.append(lc)

    # Belt with a brass buckle over the shirt.
    belt = t.ring_trim("subaru_belt", j, Vector((0, j.waist.y, j.waist.z - 0.012 * H)), Vector((0, 0, 1)), 0.024, m["belt"], lift=0.009)
    if belt:
        g.objects.append(belt)
    bk = t.plate("subaru_buckle", j, Vector((0, -1.0, j.waist.z - 0.012 * H)), Vector((0, 1, 0)), (0.03, 0.026, 0.006), m["buckle"], lift=0.012)
    if bk:
        g.objects.append(bk)
    # Shirt placket and buttons.
    pl = t.vertical_trim("subaru_placket", j, 0.0, j.waist.z + 0.005 * H, j.neck_base.z - 0.012 * H, 0.016, m["shirt_dark"], lift=0.0015)
    if pl:
        g.objects.append(pl)
    bt = t.studs("subaru_buttons", j, [(Vector((0, -1.0, j.waist.z + (j.neck_base.z - j.waist.z) * k / 5 + 0.02 * H)), Vector((0, 1, 0))) for k in range(5)], 0.0045, m["button"], lift=0.003)
    if bt:
        g.objects.append(bt)

    # Green jacket: open front, hem at the hips, cuffs short of the wrist.
    open_x = 0.05 * H

    def jacket_keep(c):
        if is_neck(c) or c.p.z < hem_z:
            return False
        if c.on_arm():
            return c.arm_s() < c.arm_len() - 0.012 * c.H
        if c.p.y < 0 and abs(c.p.x) < open_x and c.p.z < c.j.neck_base.z - 0.004 * c.H:
            return False
        return True

    jacket_cuts = [(Vector((0, 0, hem_z)), Vector((0, 0, 1))), (Vector((open_x, 0, 0)), Vector((1, 0, 0))), (Vector((-open_x, 0, 0)), Vector((1, 0, 0)))] + wrist_cut(j, 0.012)
    hem_flare = t.flare_near(j, Vector((0, 0, hem_z)), Vector((0, 0, 1)), 0.05, 0.012)

    def jacket_extra(p, n):
        e = hem_flare(p, n) + t.wrinkles(j, p, arm=1.0, waist=0.7, seed=1.3)
        if t.in_arm(j, p):
            side, s, length, d, radial = t.arm_frame(j, p)
            e += 0.006 * H * t.smoothstep(length - 0.08 * H, length - 0.012 * H, s)  # cuffs open out
        return e

    jk = t.shell("subaru_jacket", j, jacket_keep, 0.009, m["jacket"], cuts=jacket_cuts, thickness=0.004, extra=jacket_extra, subdivide=1)
    g.objects.append(jk)
    # Front edges and cuffs: darker facing.
    for s in (1, -1):
        tr = t.vertical_trim(f"subaru_facing{s}", j, s * (open_x + 0.004 * H), hem_z + 0.004 * H, j.neck_base.z - 0.01 * H, 0.012, m["jacket_dark"], lift=0.0155)
        if tr:
            g.objects.append(tr)
        a = Vector((j.arm_l.x * s, j.arm_l.y, j.arm_l.z))
        w = Vector((j.wrist_l.x * s, j.wrist_l.y, j.wrist_l.z))
        d = (w - a).normalized()
        cf = t.ring_trim(f"subaru_cuff{s}", j, w - d * 0.03 * H, d, 0.022, m["jacket_dark"], lift=0.017)
        if cf:
            g.objects.append(cf)
    # Pockets: flaps at the hips.
    for s in (1, -1):
        pk = t.plate(f"subaru_pocket{s}", j, Vector((s * 0.09 * H, -1.0, hem_z + 0.05 * H)), Vector((0, 1, 0)), (0.058, 0.024, 0.004), m["jacket_dark"], lift=0.015, spin=-0.12 * s)
        if pk:
            g.objects.append(pk)

    # Orange scarf, one tail down the front, one over the back.
    wrap, tails, guides = t.scarf("subaru_scarf", j, m["scarf"], puff=1.1, tails=[(24, 0.17, 0.06), (40, 0.12, 0.055)])
    g.objects.append(wrap)
    if tails is not None:
        g.objects.append(tails)
        g.chains.update(guides)
        g.bindings[tails.name] = list(guides)

    # The cloak, hood down.
    cp, cguides = cape("subaru_cloak", j, 0.15, 0.4, m["cloak"], chains=5, bones=4, wrap=176.0, folds=6, fold_depth=0.014, flare=0.45)
    cp["bone"] = "upperChest"
    g.objects.append(cp)
    names = []
    for i, gl in enumerate(cguides):
        g.chains[f"cape{i}"] = gl
        names.append(f"cape{i}")
    g.bindings[cp.name] = names
    # The hood lies on the cloak and swings with it.
    hood = t.hood_down("subaru_hood", j, m["cloak"], size=1.08, over=cp, skin=False)
    hood["bone"] = "upperChest"
    g.objects.append(hood)
    g.bindings[hood.name] = names
    # Clasp cords at the throat.
    for s in (1, -1):
        cl = t.plate(f"subaru_clasp{s}", j, Vector((s * 0.068 * H, -1.0, j.neck_base.z - 0.03 * H)), Vector((0, 1, 0)), (0.012, 0.012, 0.006), m["buckle"], lift=0.03)
        if cl:
            g.objects.append(cl)
    return g


def subaru() -> CharacterSpec:
    rules = [
        ("skin", lambda c: is_neck(c) or c.beyond_wrist()),
        ("trousers", lambda c: (not c.on_arm()) and c.p.z < c.j.waist.z),
        ("shirt", lambda c: True),
    ]
    return CharacterSpec(
        id="subaru",
        body=subaru_body(),
        head=subaru_head(),
        hair=subaru_hair(),
        palette={
            "skin": ("#f3d9c7", "skin"),
            "face": ("#f3d9c7", "face"),
            "hair": ("#1c1e27", "hair"),
            "shirt": ("#ddd0b0", "cloth"),
            "shirt_dark": ("#cbbb98", "cloth"),
            "button": ("#8a6a48", "cloth"),
            "jacket": ("#4f6b45", "cloth"),
            "jacket_dark": ("#3c5236", "cloth"),
            "belt": ("#6b4a30", "cloth"),
            "buckle": ("#c9a75a", "metal"),
            "scarf": ("#e3782f", "cloth"),
            "trousers": ("#33353e", "cloth"),
            "boot": ("#7b5334", "cloth"),
            "boot_toe": ("#62422a", "cloth"),
            "sole": ("#2e231c", "cloth"),
            "lace": ("#e2d6b8", "cloth"),
            "cloak": ("#43454f", "cloth"),
        },
        zones=rules,
        default_zone="shirt",
        face=FACE,
        garments=arc6_garments,
        meta={"name": "Natsuki Subaru", "costume": "arc6"},
        cuts=lambda j: [(Vector((0, 0, j.waist.z)), Vector((0, 0, 1)))],
        hidden=lambda c: (c.on_arm() and c.arm_s() < c.arm_len() - 0.03 * c.H and c.arm_s() > 0.02 * c.H)
        or ((not c.on_arm()) and 0.06 * c.H < c.p.z < 0.19 * c.H and abs(c.p.x) > 0.02 * c.H),
    )


# --------------------------------------------------------------------------- tracksuit


def tracksuit_garments(j: Joints, m: dict) -> Garments:
    H = j.H
    g = Garments()
    hem_z = j.pelvis.z + 0.004 * H
    yoke_z = j.upper_chest.z - 0.008 * H  # where the charcoal yoke meets the white panel
    v_z = j.upper_chest.z + 0.006 * H  # bottom of the open neck

    def trouser_keep(c):
        return (not c.on_arm()) and j.ankle_l.z + 0.012 * H < c.p.z < j.waist.z - 0.005 * H and abs(c.p.x) > 0.002 * H

    def trouser_extra(p, n):
        return t.wrinkles(j, p, leg=1.1, seed=0.2) + 0.006 * H * (1 - t.smoothstep(0, 0.05 * H, p.z - j.ankle_l.z))

    g.objects.append(t.shell("subaru_trousers", j, trouser_keep, 0.007, m["grey"], cuts=[(Vector((0, 0, j.ankle_l.z + 0.012 * H)), Vector((0, 0, 1))), (Vector((0, 0, j.waist.z - 0.005 * H)), Vector((0, 0, 1)))], thickness=0.003, extra=trouser_extra, subdivide=1))
    # Orange stripes down the outside of each leg.
    for side in (1, -1):
        path = []
        for i in range(26):
            z = j.waist.z - 0.02 * H - (j.waist.z - 0.02 * H - j.ankle_l.z - 0.02 * H) * i / 25
            k = (j.hip_l.z - z) / (j.hip_l.z - j.ankle_l.z)
            x = side * (j.hip_l.x + (j.ankle_l.x - j.hip_l.x) * max(0.0, k))
            y = j.hip_l.y + (j.ankle_l.y - j.hip_l.y) * max(0.0, k)
            path.append((Vector((x, y, z)), Vector((side, 0, 0))))
        st = t.trim(f"subaru_legstripe{side}", j, path, 0.012, m["orange"], lift=0.0115)
        if st:
            g.objects.append(st)
    for side in (1, -1):
        def stripe(tt, c, n, side=side):
            return 0.25 < tt < 0.7 and abs(n.x) > 0.7 and 0.018 * H < c.z < 0.03 * H
        g.objects.append(t.shoe(f"subaru_shoe{side}", j, side, m["shoe"], m["orange"], length=1.3, width=1.15, height=0.92, sole=0.016, collar=0.062, mat_toe=m["shoe_toe"], mat_collar=m["orange"], stripe=(m["white"], stripe)))

    # Jacket: closed with a zip, the neck open in a V over the black tee.
    def jacket_keep(c):
        if is_neck(c) or c.p.z < hem_z:
            return False
        if c.on_arm():
            return c.arm_s() < c.arm_len() - 0.008 * c.H
        if c.p.y < 0 and c.p.z > v_z and abs(c.p.x) < 0.03 * c.H + (c.p.z - v_z) * 0.9:
            return False
        return True

    def yoke(c):
        if c.on_arm():
            return True
        # The charcoal yoke drops in a gentle curve towards the shoulders.
        return c.p.z > yoke_z - 0.02 * c.H * (abs(c.p.x) / (0.12 * c.H)) ** 2 or c.p.y > 0.02 * c.H

    rules = [
        ("orange", lambda c: c.on_arm() and c.arm_s() > c.arm_len() - 0.04 * c.H),
        ("grey", yoke),
        ("white", lambda c: True),
    ]
    hem_flare = t.flare_near(j, Vector((0, 0, hem_z)), Vector((0, 0, 1)), 0.04, 0.004)

    def jacket_extra(p, n):
        return hem_flare(p, n) + t.wrinkles(j, p, arm=1.1, waist=0.8, seed=2.1)

    cuts = [(Vector((0, 0, hem_z)), Vector((0, 0, 1))), (Vector((0, 0, yoke_z)), Vector((0, 0, 1)))] + wrist_cut(j, 0.008) + wrist_cut(j, 0.04)
    g.objects.append(t.shell("subaru_jacket", j, jacket_keep, 0.01, cuts=cuts, thickness=0.004, extra=jacket_extra, subdivide=1, rules=rules, materials=m, default="white"))

    # Ribbed hem band and drawstring toggles.
    band = t.ring_trim("subaru_hemband", j, Vector((0, j.pelvis.y, hem_z + 0.012 * H)), Vector((0, 0, 1)), 0.026, m["grey"], lift=0.0145)
    if band:
        g.objects.append(band)
    for s in (1, -1):
        tg = t.plate(f"subaru_toggle{s}", j, Vector((s * 0.045 * H, -1.0, hem_z + 0.002 * H)), Vector((0, 1, 0)), (0.009, 0.03, 0.009), m["white"], lift=0.02, bevel=0.45)
        if tg:
            g.objects.append(tg)
    # Orange piping along the yoke seam, front and back.
    for sgn in (-1, 1):
        path = []
        for i in range(25):
            x = -0.15 * H + 0.3 * H * i / 24
            z = yoke_z - 0.02 * H * (abs(x) / (0.12 * H)) ** 2
            path.append((Vector((x, sgn * 1.0, z)), Vector((0, -sgn, 0))))
        pp = t.trim(f"subaru_piping{sgn}", j, path, 0.008, m["orange"], lift=0.0145)
        if pp:
            g.objects.append(pp)
    # Orange stripe down the outside of each sleeve.
    for s in (1, -1):
        a = Vector((j.arm_l.x * s, j.arm_l.y, j.arm_l.z))
        w = Vector((j.wrist_l.x * s, j.wrist_l.y, j.wrist_l.z))
        d = (w - a).normalized()
        up = (Vector((0, 0, 1)) - d * d.z).normalized()
        out = (up + Vector((s * 0.35, 0, 0))).normalized()
        path = []
        for i in range(20):
            p = a + (w - a) * (0.02 + 0.9 * i / 19)
            path.append((p, out))
        st = t.trim(f"subaru_sleevestripe{s}", j, path, 0.011, m["orange"], lift=0.0145)
        if st:
            g.objects.append(st)
    # Zip down the front, with its pull at the top of the V.
    zp = t.vertical_trim("subaru_zip", j, 0.0, hem_z + 0.004 * H, v_z, 0.007, m["zip"], lift=0.0145)
    if zp:
        g.objects.append(zp)
    pull = t.plate("subaru_zippull", j, Vector((0, -1.0, v_z - 0.018 * H)), Vector((0, 1, 0)), (0.009, 0.024, 0.004), m["zip"], lift=0.017)
    if pull:
        g.objects.append(pull)
    # The "N" on the left chest.
    n = t.glyph("subaru_logo", j, Vector((0.075 * H, -1.0, j.chest.z + 0.022 * H)), Vector((0, 1, 0)), [((0, 0), (0, 1)), ((0, 1), (1, 0)), ((1, 0), (1, 1))], 0.032, 0.007, m["grey"], lift=0.0145)
    if n:
        g.objects.append(n)
    # Stand-up collar, open at the front: charcoal outside, orange inside.
    collar = open_collar("subaru_collar", j, 0.03 * H, m["grey"], m["orange"])
    g.objects.append(collar)
    return g


def open_collar(name: str, j: Joints, height: float, mat_out, mat_in, gap_deg: float = 56.0):
    """A tracksuit's stand-up collar unzipped at the throat: a partial ring
    round the neck that leans out, outer and inner faces in two colours."""
    import bmesh

    H = j.H
    bm = bmesh.new()
    seg = 28
    rows = []
    gap = math.radians(gap_deg)
    for zi in range(4):
        k = zi / 3
        row = []
        for i in range(seg + 1):
            a = gap / 2 + (2 * math.pi - gap) * i / seg  # 0 = front
            # Open ends fold back a little.
            end = min(i, seg - i) / seg
            fold = 1 + 0.25 * (1 - min(1.0, end * 8)) * k
            rx = 0.05 * H * (1 + 0.16 * k) * fold
            ry = 0.047 * H * (1 + 0.16 * k) * fold
            z = j.neck_base.z - 0.022 * H + height * k * (0.75 + 0.25 * math.cos(a) * -1) + 0.004 * H * math.cos(a)
            row.append(bm.verts.new(Vector((math.sin(a) * rx, j.neck_base.y - math.cos(a) * ry, z))))
        rows.append(row)
    for r in range(3):
        for i in range(seg):
            bm.faces.new((rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i]))
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.005 * H
    sol.use_rim = True
    t._apply(obj, sol)
    me.materials.append(mat_out)
    me.materials.append(mat_in)
    for p in me.polygons:
        p.use_smooth = True
        radial = Vector((p.center.x, p.center.y - j.neck_base.y, 0))
        p.material_index = 1 if radial.length > 1e-6 and p.normal.dot(radial.normalized()) < -0.2 else 0
    t.skin_like_body(obj, j)
    return obj


def subaru_tracksuit() -> CharacterSpec:
    rules = [
        ("skin", lambda c: is_neck(c) or c.beyond_wrist()),
        ("grey", lambda c: (not c.on_arm()) and c.p.z < c.j.waist.z),
        ("tee", lambda c: True),
    ]
    return CharacterSpec(
        id="subaru_tracksuit",
        body=subaru_body(),
        head=subaru_head(),
        hair=subaru_hair(),
        palette={
            "skin": ("#f3d9c7", "skin"),
            "face": ("#f3d9c7", "face"),
            "hair": ("#1c1e27", "hair"),
            "white": ("#eeede8", "cloth"),
            "grey": ("#393c45", "cloth"),
            "orange": ("#ec7a2c", "cloth"),
            "tee": ("#1d1d22", "cloth"),
            "zip": ("#2a2b31", "metal"),
            "shoe": ("#1d1d22", "cloth"),
            "shoe_toe": ("#2c2d33", "cloth"),
        },
        zones=rules,
        default_zone="tee",
        face=FACE,
        garments=tracksuit_garments,
        meta={"name": "Natsuki Subaru", "costume": "tracksuit"},
        cuts=lambda j: [(Vector((0, 0, j.waist.z)), Vector((0, 0, 1)))],
        hidden=lambda c: (c.on_arm() and 0.02 * c.H < c.arm_s() < c.arm_len() - 0.03 * c.H) or ((not c.on_arm()) and j_ankle_band(c)),
    )


def j_ankle_band(c: ZoneContext) -> bool:
    return 0.035 * c.H < c.p.z < c.j.knee_l.z and abs(c.p.x) > 0.02 * c.H

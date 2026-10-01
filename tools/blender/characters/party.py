"""Canon detail pass over the party: each spec from roster.py, dressed with
the tailoring tools — real sleeves and cuffs, bows and brooches, braids and
hair ornaments, frilled petticoats, modelled shoes.
"""
from __future__ import annotations

import math

import bpy  # noqa: F401
from mathutils import Vector

import accessories as acc
from hair import HeadFrame
from humanoid import Joints
from outfit import Garments, SkirtSpec, ZoneContext, skirt
import roster as R
import tailor as t


# --------------------------------------------------------------------------- shared


def wrist_cuts(j: Joints, back: float):
    out = []
    for side in (1, -1):
        a = Vector((j.arm_l.x * side, j.arm_l.y, j.arm_l.z))
        w = Vector((j.wrist_l.x * side, j.wrist_l.y, j.wrist_l.z))
        d = (w - a).normalized()
        out.append((w - d * back * j.H, d))
    return out


def arm_axis(j: Joints, side: int):
    a = Vector((j.arm_l.x * side, j.arm_l.y, j.arm_l.z))
    w = Vector((j.wrist_l.x * side, j.wrist_l.y, j.wrist_l.z))
    return a, w, (w - a).normalized()


def sleeves(name: str, j: Joints, mat, *, start: float = 0.02, back: float = 0.006, offset: float = 0.007, bell: float = 0.012, seed: float = 0.9):
    """Long sleeves from the shoulder to the wrist, belling out at the cuff."""
    H = j.H

    def keep(c: ZoneContext) -> bool:
        return c.on_arm() and start * H < c.arm_s() < c.arm_len() - back * H

    def extra(p, n):
        side, s, length, d, radial = t.arm_frame(j, p)
        return t.wrinkles(j, p, arm=0.8, seed=seed) + bell * H * t.smoothstep(length * 0.55, length, s) ** 1.5

    return t.shell(name, j, keep, offset, mat, cuts=wrist_cuts(j, back), thickness=0.003, extra=extra, subdivide=1)


def shoes(g: Garments, prefix: str, j: Joints, upper, sole_mat, **kw) -> None:
    for side in (1, -1):
        g.objects.append(t.shoe(f"{prefix}_shoe{side}", j, side, upper, sole_mat, **kw))


def chest_point(j: Joints, z: float, x: float = 0.0, lift: float = 0.0):
    hit = t.front_point(j, x, z, lift * j.H)
    return hit if hit else (Vector((x, j.chest.y - 0.08 * j.H, z)), Vector((0, -1, 0)))


def under_shoes(c: ZoneContext) -> bool:
    return (not c.on_arm()) and c.p.z < c.j.ankle_l.z - 0.004 * c.H and abs(c.p.x) > 0.01 * c.H


def under_sleeves(c: ZoneContext) -> bool:
    return c.on_arm() and 0.04 * c.H < c.arm_s() < c.arm_len() - 0.03 * c.H


# --------------------------------------------------------------------------- Emilia


def emilia():
    spec = R.emilia()
    spec.head.elf_ear = 1.7
    spec.palette.update({
        "ribbon": ("#7a58c2", "cloth"),
        "gold": ("#dbb75c", "metal"),
        "sole": ("#7a58c2", "cloth"),
        "flower_c": ("#c7b2ee", "cloth"),
    })
    base_g = spec.garments
    base_a = spec.accessories

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        g.objects.append(sleeves("emilia_sleeves", j, m["dress"], bell=0.014))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            cf = t.ring_trim(f"emilia_cuff{s}", j, w - d * 0.022 * H, d, 0.018, m["purple"], lift=0.02)
            if cf:
                g.objects.append(cf)
        # A purple ribbon bow at the throat, pinned with a gold brooch.
        p, n = chest_point(j, j.neck_base.z - 0.03 * H, lift=0.028)
        bw = t.bow("emilia_bow", p, n, 0.032 * H, m["ribbon"], knot_mat=m["gold"], tails=0.9)
        bw["bone"] = "upperChest"
        g.objects.append(bw)
        br = t.studs("emilia_brooch", j, [(Vector((0, -1.0, j.chest.z + 0.015 * H)), Vector((0, 1, 0)))], 0.011, m["gold"], lift=0.012, flat=0.45)
        if br:
            g.objects.append(br)
        # Boots: heeled, with purple soles.
        shoes(g, "emilia", j, m["boot"], m["sole"], length=1.12, width=0.92, height=0.95, sole=0.016, collar=0.085)
        return g

    def accessories(j: Joints, m: dict, head):
        out = []
        f = HeadFrame(j, 0.84, 0.94)
        # The white lily on her left, a smaller one on the right.
        for side, az, el, r in ((1, 66, 40, 0.032), (-1, -70, 34, 0.022)):
            p = f.surface(az, el, 0.085)
            out.append(acc.flower(f"emilia_flower{side}", p, (p - f.c).normalized(), r, 6, m["flower"], m["flower_c"], cup=0.45))
        # Thin braids from in front of each ear, tied with purple ribbons.
        for s in (1, -1):
            p0 = f.surface(74 * s, 14, 0.07)
            pts = [p0 + Vector((0.006 * s * k, -0.012 * k, -0.034 * k * j.H / 1.64)) for k in range(8)]
            out.append(acc.braid(f"emilia_braid{s}", pts, 0.022, m["hair"]))
            tie = t.bow(f"emilia_tie{s}", pts[-1] + Vector((0, -0.012, 0.004)), Vector((0.25 * s, -1, 0)), 0.014, m["ribbon"], tails=0.6, droop=0.1)
            out.append(tie)
        return out

    spec.garments = garments
    spec.accessories = accessories
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    _ = base_a
    return spec


# --------------------------------------------------------------------------- Beatrice


def beatrice():
    spec = R.beatrice()
    spec.palette.update({
        "bow": ("#d24a7c", "cloth"),
        "lace": ("#fff8fb", "cloth"),
        "sole": ("#7c2f52", "cloth"),
    })
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        # Frilled white petticoat filling the overskirt's open front.
        pt, guides = skirt("beatrice_petticoat", j, SkirtSpec(top_z=j.waist.z / H - 0.01, length=0.29, top_rx=0.08, top_ry=0.064, flare=1.85, folds=20, fold_depth=0.12, chain_count=7, chain_bones=3), m["trim"])
        g.objects.append(pt)
        names = [k for k in g.chains if k.startswith("skirt")]
        g.bindings[pt.name] = names
        for tier, (dz, rr) in enumerate(((0.2, 1.6), (0.26, 1.78))):
            fr = t.frill_ring(f"beatrice_tier{tier}", Vector((0, j.waist.y, j.waist.z - dz * H)), Vector((0, 0, -1)), 0.08 * H * rr, 0.035 * H, m["lace"], waves=22, flare=0.35)
            g.objects.append(fr)
            g.bindings[fr.name] = names
        # Wide bell sleeves ending in lace.
        g.objects.append(sleeves("beatrice_sleeves", j, m["dress"], bell=0.03, offset=0.01))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            fr = t.frill_ring(f"beatrice_lace{s}", w - d * 0.012 * H, d, 0.036 * H, 0.03 * H, m["lace"], waves=14, flare=0.4)
            t.skin_like_body(fr, j)
            g.objects.append(fr)
        # The big bow at her chest.
        p, n = chest_point(j, j.chest.z + 0.03 * H, lift=0.03)
        bw = t.bow("beatrice_bow", p, n, 0.06 * H, m["bow"], tails=0.7)
        bw["bone"] = "upperChest"
        g.objects.append(bw)
        # Mary Janes.
        shoes(g, "beatrice", j, m["shoe"], m["sole"], length=1.1, width=1.0, height=0.85, sole=0.014, collar=0.06)
        for side in (1, -1):
            x = j.ankle_l.x * side
            st = t.trim(f"beatrice_strap{side}", j, [(Vector((x + side * 0.03 * H * math.cos(a_), j.ankle_l.y - 0.035 * H + 0.012 * H * math.sin(a_), 0.06 * j.H)), Vector((0, 0, -1))) for a_ in [math.pi * k / 8 for k in range(9)]], 0.008, m["sole"], lift=0.012)
            if st:
                g.objects.append(st)
        return g

    base_a = spec.accessories

    def accessories(j: Joints, m: dict, head):
        f = HeadFrame(j, 0.9, 0.96)
        p = f.surface(-30, 70, 0.24)
        cr = acc.crown("beatrice_crown", p, (p - f.c).normalized(), 0.03 * j.H, m["gold"])
        return [cr]

    spec.garments = garments
    spec.accessories = accessories
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    _ = base_a
    return spec


# --------------------------------------------------------------------------- Julius


def julius():
    """Royal Guard: white coat with gold piping, a double row of gold
    buttons, gold epaulettes and an aiguillette, white gloves, tall black
    boots, the navy cape and his sword."""
    spec = R.julius()
    spec.palette.update({"gold_cord": ("#e2bd62", "metal"), "sole": ("#141317", "cloth"), "lining": ("#5a4b8a", "cloth")})
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        g.objects.append(sleeves("julius_sleeves", j, m["coat"], bell=0.004, offset=0.008, back=0.02))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            cf = t.ring_trim(f"julius_cuff{s}", j, w - d * 0.035 * H, d, 0.026, m["gold"], lift=0.016)
            if cf:
                g.objects.append(cf)
            # Epaulettes: a gold board with a fringe over each shoulder.
            top = a + Vector((0, 0, 0.03 * H)) - d * 0.01 * H
            ep = t.plate(f"julius_epaulette{s}", j, top + Vector((0, 0, 0.3 * H)), Vector((0, 0, -1)), (0.06, 0.045, 0.008), m["gold"], lift=0.02, bevel=0.45)
            if ep:
                g.objects.append(ep)
            fr = t.frill_ring(f"julius_fringe{s}", a + d * 0.01 * H + Vector((0, 0, 0.012 * H)), d, 0.05 * H, 0.025 * H, m["gold_cord"], waves=20, flare=0.15)
            t.skin_like_body(fr, j)
            g.objects.append(fr)
        # Gold buttons, two rows down the chest.
        pts = [(Vector((sx * 0.035 * H, -1.0, j.waist.z + (j.upper_chest.z - j.waist.z) * k / 4)), Vector((0, 1, 0))) for sx in (1, -1) for k in range(5)]
        bt = t.studs("julius_buttons", j, pts, 0.007, m["gold"], lift=0.009)
        if bt:
            g.objects.append(bt)
        # Aiguillette: gold cords looping from the right shoulder across the chest.
        for k, sag in enumerate((0.06, 0.1)):
            path = []
            for i in range(14):
                u = i / 13
                x = -0.11 * H + 0.1 * H * u
                z = j.upper_chest.z + 0.01 * H - sag * H * math.sin(math.pi * u) - 0.02 * H * u
                path.append((Vector((x, -1.0, z)), Vector((0, 1, 0))))
            cord = t.trim(f"julius_cord{k}", j, path, 0.006, m["gold_cord"], lift=0.012, thickness=0.004)
            if cord:
                g.objects.append(cord)
        shoes(g, "julius", j, m["boot"], m["sole"], length=1.25, width=1.02, height=1.1, sole=0.012, collar=0.08)
        for side in (1, -1):
            x = j.ankle_l.x * side
            bc = t.ring_trim(f"julius_bootcuff{side}", j, Vector((x, j.knee_l.y, 0.27 * H)), Vector((0, 0, 1)), 0.022, m["boot"], lift=0.01)
            if bc:
                g.objects.append(bc)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


# --------------------------------------------------------------------------- Ram / Rem


def maid_upgrade(spec, cid: str):
    """The Roswaal mansion uniform: puffed black shoulders over white
    detached sleeves, a black bow at the breast, frilled cuffs, white
    stockings and strapped black shoes."""
    spec.palette.update({"sole": ("#101014", "cloth"), "ribbon": ("#16141b", "cloth")})
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H

        # Puffed short sleeves.
        def puff_keep(c):
            return c.on_arm() and c.arm_s() < 0.32 * c.arm_len()

        def puff_extra(p, n):
            side, s_, length, d, radial = t.arm_frame(j, p)
            u = s_ / length
            return 0.0075 * H * math.sin(math.pi * min(1.0, max(0.0, u / 0.32))) + t.wrinkles(j, p, arm=0.4)

        cuts = []
        for side in (1, -1):
            a, w, d = arm_axis(j, side)
            cuts.append((a + (w - a) * 0.32, d))
        g.objects.append(t.shell(f"{cid}_puffs", j, puff_keep, 0.006, m["black"], cuts=cuts, thickness=0.003, extra=puff_extra, subdivide=1))

        # Detached white sleeves from above the elbow to a frilled cuff.
        def sl_keep(c):
            return c.on_arm() and 0.42 * c.arm_len() < c.arm_s() < c.arm_len() - 0.006 * c.H

        def sl_extra(p, n):
            side, s_, length, d, radial = t.arm_frame(j, p)
            return 0.008 * H * t.smoothstep(length * 0.6, length, s_) + t.wrinkles(j, p, arm=0.6, seed=0.3)

        cuts = wrist_cuts(j, 0.006)
        for side in (1, -1):
            a, w, d = arm_axis(j, side)
            cuts.append((a + (w - a) * 0.42, d))
        g.objects.append(t.shell(f"{cid}_sleeves", j, sl_keep, 0.007, m["white"], cuts=cuts, thickness=0.003, extra=sl_extra, subdivide=1))
        for side in (1, -1):
            a, w, d = arm_axis(j, side)
            top = t.frill_ring(f"{cid}_sleevefrill{side}", a + (w - a) * 0.42, -d, 0.034 * H, 0.016 * H, m["white"], waves=14, flare=0.25)
            t.skin_like_body(top, j)
            g.objects.append(top)
            rb = t.ring_trim(f"{cid}_sleeveband{side}", j, a + (w - a) * 0.47, d, 0.012, m["ribbon"], lift=0.012)
            if rb:
                g.objects.append(rb)
            cf = t.frill_ring(f"{cid}_cufffrill{side}", w - d * 0.01 * H, d, 0.026 * H, 0.02 * H, m["white"], waves=12, flare=0.45)
            t.skin_like_body(cf, j)
            g.objects.append(cf)
        # Black bow at the breast.
        p, n = chest_point(j, j.chest.z + 0.04 * H, lift=0.02)
        bw = t.bow(f"{cid}_bow", p, n, 0.03 * H, m["ribbon"], tails=0.8)
        bw["bone"] = "upperChest"
        g.objects.append(bw)
        shoes(g, cid, j, m["shoe"], m["sole"], length=1.08, width=0.95, height=0.85, sole=0.013, collar=0.06)
        for side in (1, -1):
            x = j.ankle_l.x * side
            st = t.trim(f"{cid}_strap{side}", j, [(Vector((x + side * 0.028 * j.H * math.cos(a_), j.ankle_l.y - 0.03 * j.H + 0.012 * j.H * math.sin(a_), 0.06 * j.H)), Vector((0, 0, -1))) for a_ in [math.pi * k / 8 for k in range(9)]], 0.007, m["shoe"], lift=0.012)
            if st:
                g.objects.append(st)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c)
    return spec


def ram():
    return maid_upgrade(R.ram(), "ram")


def rem():
    return maid_upgrade(R.rem(), "rem")


# --------------------------------------------------------------------------- Meili, Anastasia, Shaula


def meili():
    spec = R.meili()
    spec.palette.update({"ribbon": ("#c23a5a", "cloth"), "sole": ("#24180f", "cloth")})
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        g.objects.append(sleeves("meili_sleeves", j, m["dress"], bell=0.01))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            cf = t.frill_ring(f"meili_cuff{s}", w - d * 0.012 * H, d, 0.03 * H, 0.022 * H, m["trim"], waves=12, flare=0.35)
            t.skin_like_body(cf, j)
            g.objects.append(cf)
        p, n = chest_point(j, j.neck_base.z - 0.04 * H, lift=0.03)
        bw = t.bow("meili_bow", p, n, 0.03 * H, m["ribbon"], tails=0.8)
        bw["bone"] = "upperChest"
        g.objects.append(bw)
        shoes(g, "meili", j, m["boot"], m["sole"], length=1.1, width=1.0, height=1.0, sole=0.014, collar=0.075)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


def anastasia():
    spec = R.anastasia()
    spec.palette.update({"sash": ("#9b83c9", "cloth"), "sole": ("#bfb2d6", "cloth")})
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        g.objects.append(sleeves("ana_sleeves", j, m["gown"], bell=0.03, offset=0.01))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            cf = t.frill_ring(f"ana_cuff{s}", w - d * 0.006 * H, d, 0.04 * H, 0.025 * H, m["trim"], waves=14, flare=0.35)
            t.skin_like_body(cf, j)
            g.objects.append(cf)
        sh = t.ring_trim("ana_sash", j, Vector((0, j.waist.y, j.waist.z + 0.005 * H)), Vector((0, 0, 1)), 0.035, m["sash"], lift=0.012)
        if sh:
            g.objects.append(sh)
        hit = t.front_point(j, 0.0, j.waist.z, 0.03 * H, side=1.0)
        if hit:
            bw = t.bow("ana_bow", hit[0], hit[1], 0.05 * H, m["sash"], tails=1.3)
            bw["bone"] = "spine"
            g.objects.append(bw)
        shoes(g, "ana", j, m["shoe"], m["sole"], length=1.06, width=0.92, height=0.85, sole=0.013, collar=0.06)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


def shaula():
    spec = R.shaula()
    spec.palette.update({"sole": ("#0f0d10", "cloth"), "tie": ("#e67a2e", "cloth")})
    base_g = spec.garments
    # Clean garment pieces instead of painted zones: skin everywhere but the boots.
    spec.zones = [
        ("skin", lambda c: R.is_skin_neck(c) or R.is_hand(c)),
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= 0.27 * c.H),
        ("skin", lambda c: True),
    ]
    spec.cuts = lambda j: [(Vector((0, 0, 0.27 * j.H)), Vector((0, 0, 1)))]

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        z0, z1 = j.chest.z - 0.035 * H, j.upper_chest.z + 0.004 * H
        g.objects.append(t.shell("shaula_top", j, lambda c: (not c.on_arm()) and z0 < c.p.z < z1 and abs(c.p.x) < 0.11 * H, 0.004, m["black"], cuts=[(Vector((0, 0, z0)), Vector((0, 0, 1))), (Vector((0, 0, z1)), Vector((0, 0, 1)))], thickness=0.003, subdivide=1))
        s0, s1 = j.hip_l.z - 0.075 * H, j.waist.z - 0.03 * H
        g.objects.append(t.shell("shaula_shorts", j, lambda c: (not c.on_arm()) and s0 < c.p.z < s1, 0.005, m["black"], cuts=[(Vector((0, 0, s0)), Vector((0, 0, 1))), (Vector((0, 0, s1)), Vector((0, 0, 1)))], thickness=0.003, extra=lambda p, n: t.wrinkles(j, p, leg=0.5), subdivide=1))
        belt = t.ring_trim("shaula_belt", j, Vector((0, j.waist.y, s1 - 0.004 * H)), Vector((0, 0, 1)), 0.022, m["orange"], lift=0.009)
        if belt:
            g.objects.append(belt)
        shoes(g, "shaula", j, m["boot"], m["sole"], length=1.15, width=0.95, height=1.1, sole=0.014, collar=0.085)
        for side in (1, -1):
            x = j.ankle_l.x * side
            bc = t.ring_trim(f"shaula_bootcuff{side}", j, Vector((x, j.knee_l.y, 0.268 * j.H)), Vector((0, 0, 1)), 0.02, m["orange"], lift=0.012)
            if bc:
                g.objects.append(bc)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c)
    return spec


UPGRADES = {
    "emilia": emilia,
    "beatrice": beatrice,
    "julius": julius,
    "ram": ram,
    "rem": rem,
    "meili": meili,
    "anastasia": anastasia,
    "shaula": shaula,
}

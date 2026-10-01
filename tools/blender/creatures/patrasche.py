"""Patrasche — a Diana-breed land dragon, Subaru's partner.

A raptor-like biped: a long S-curved neck and a narrow, horse-long head,
deep keeled chest, heavy drumstick thighs over slender digitigrade shins,
three-toed feet with a raised sickle claw, small clawed forelimbs and a
long counterweight tail. Black scales with a blue sheen and darker bands
along the back; a pale beige throat, chest and belly. Gold eyes with slit
pupils. Dark feather plumes: a crest swept back from the skull, a mane
down the back of the neck and a fan at the tail tip.

Tack from pulling the Emilia camp's carriage: a brown leather visor that
covers the brow and nose and ends in a beak over the nostrils, a bridle
(noseband, cheek pieces, brow band, throatlatch) with gold bit rings and
reins back to the saddle; a saddle on a deep red pad with flaps and
stirrups, a girth and breast collar with gold buckles, and leather wraps
round the tail.
"""
from __future__ import annotations

import math

import bpy  # noqa: F401
from mathutils import Vector

from creature import Builder, CreatureSpec, Part, ZoneCtx
import kit


def V(x: float, y: float, z: float) -> Vector:
    return Vector((x, y, z))


def ss(a: float, b: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - a) / (b - a))) if b != a else 0.0
    return t * t * (3 - 2 * t)


def mix(a, c, t):
    return tuple(a[i] + (c[i] - a[i]) * t for i in range(3))


SCALE = (0.165, 0.172, 0.215)
SCALE_TOP = (0.115, 0.12, 0.155)
BELLY = (0.85, 0.79, 0.66)
FOOT = (0.12, 0.12, 0.14)


def _spec() -> CreatureSpec:
    nodes = {
        "pelvis": (V(0, 0.28, 1.2), 0.22, 0.25),
        "belly": (V(0, -0.06, 1.17), 0.265, 0.31),
        "chest": (V(0, -0.43, 1.22), 0.25, 0.33),
        "withers": (V(0, -0.66, 1.37), 0.19, 0.23),
        "neck0": (V(0, -0.83, 1.56), 0.15, 0.17),
        "neck1": (V(0, -0.93, 1.75), 0.125, 0.135),
        "neck2": (V(0, -0.99, 1.9), 0.11, 0.115),
        "skull": (V(0, -1.1, 2.03), 0.125, 0.13),
        "snout": (V(0, -1.34, 2.0), 0.088, 0.085),
        "nose": (V(0, -1.53, 1.96), 0.058, 0.055),
        "tail0": (V(0, 0.6, 1.2), 0.17, 0.19),
        "tail1": (V(0, 0.95, 1.16), 0.13, 0.14),
        "tail2": (V(0, 1.3, 1.1), 0.1, 0.105),
        "tail3": (V(0, 1.65, 1.04), 0.074, 0.077),
        "tail4": (V(0, 2.0, 0.99), 0.052, 0.054),
        "tail5": (V(0, 2.32, 0.96), 0.034, 0.035),
        "tail_tip": (V(0, 2.6, 0.95), 0.012, 0.012),
        "hip.L": (V(0.19, 0.2, 1.12), 0.2, 0.22),
        "thigh.L": (V(0.235, 0.05, 0.92), 0.17, 0.175),
        "knee.L": (V(0.245, -0.11, 0.7), 0.095, 0.1),
        "shin.L": (V(0.245, 0.0, 0.5), 0.066, 0.07),
        "ankle.L": (V(0.245, 0.13, 0.3), 0.05, 0.054),
        "ball.L": (V(0.245, 0.03, 0.07), 0.05, 0.046),
        "toe_c.L": (V(0.25, -0.2, 0.034), 0.032, 0.028),
        "toe_i.L": (V(0.19, -0.14, 0.034), 0.028, 0.025),
        "toe_o.L": (V(0.31, -0.15, 0.034), 0.028, 0.025),
        "shoulder.L": (V(0.15, -0.6, 1.22), 0.065, 0.07),
        "elbow.L": (V(0.2, -0.67, 1.02), 0.048, 0.05),
        "wrist.L": (V(0.2, -0.79, 0.92), 0.035, 0.037),
        "hand.L": (V(0.19, -0.87, 0.88), 0.027, 0.027),
    }
    edges = [
        ("pelvis", "belly"), ("belly", "chest"), ("chest", "withers"), ("withers", "neck0"), ("neck0", "neck1"),
        ("neck1", "neck2"), ("neck2", "skull"), ("skull", "snout"), ("snout", "nose"),
        ("pelvis", "tail0"), ("tail0", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"), ("tail3", "tail4"), ("tail4", "tail5"), ("tail5", "tail_tip"),
        ("pelvis", "hip.L"), ("hip.L", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "shin.L"), ("shin.L", "ankle.L"), ("ankle.L", "ball.L"),
        ("ball.L", "toe_c.L"), ("ball.L", "toe_i.L"), ("ball.L", "toe_o.L"),
        ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "wrist.L"), ("wrist.L", "hand.L"),
    ]
    bones = [
        ("hips", "pelvis", "belly", "root"),
        ("spine", "belly", "chest", "hips"),
        ("chest", "chest", "withers", "spine"),
        ("neck0", "withers", "neck0", "chest"),
        ("neck1", "neck0", "neck1", "neck0"),
        ("neck2", "neck1", "neck2", "neck1"),
        ("head", "neck2", "nose", "neck2"),
        ("jaw", "skull", "nose", "head"),
        ("tail0", "tail0", "tail1", "hips"),
        ("tail1", "tail1", "tail2", "tail0"),
        ("tail2", "tail2", "tail3", "tail1"),
        ("tail3", "tail3", "tail4", "tail2"),
        ("tail4", "tail4", "tail5", "tail3"),
        ("tail5", "tail5", "tail_tip", "tail4"),
        ("thigh.L", "hip.L", "knee.L", "hips"),
        ("shin.L", "knee.L", "ankle.L", "thigh.L"),
        ("meta.L", "ankle.L", "ball.L", "shin.L"),
        ("toe.L", "ball.L", "toe_c.L", "meta.L"),
        ("arm.L", "shoulder.L", "elbow.L", "chest"),
        ("forearm.L", "elbow.L", "wrist.L", "arm.L"),
        ("hand.L", "wrist.L", "hand.L", "forearm.L"),
    ]

    def zone(c: ZoneCtx) -> str:
        return "body"

    def sculpt(v: Vector, b: Builder) -> Vector:
        # Deep, narrow torso with a keel under the chest.
        if -0.8 < v.y < 0.6 and v.z > 0.85 and abs(v.x) < 0.34:
            v.x *= 0.88
            if v.z < 1.05 and -0.6 < v.y < -0.2:
                v.z -= 0.03 * (1 - abs(v.y + 0.4) / 0.2)
        # Thigh muscle: a rounded drumstick bulging forward and out.
        for s in (1, -1):
            c = V(0.24 * s, 0.02, 0.95)
            d = (v - c)
            k = (d.x / 0.2) ** 2 + (d.y / 0.22) ** 2 + (d.z / 0.24) ** 2
            if k < 1 and v.x * s > 0.12:
                v.x += s * 0.03 * (1 - k)
        # Head: narrow, flat-sided, with a brow ridge and a long nose bridge.
        if v.y < -1.02 and v.z > 1.9:
            v.x *= 0.84
            if v.z > 2.08 and -1.3 < v.y < -1.1:
                v.z += 0.018 * (1 - abs(v.y + 1.2) / 0.1)
            # Brow ridge over each eye.
            for s in (1, -1):
                e = V(0.09 * s, -1.2, 2.1)
                dd = (v - e).length
                if dd < 0.05:
                    v += (v - V(0, v.y, 2.0)).normalized() * 0.012 * (1 - dd / 0.05)
        # The snout's lower half belongs to the separate jaw.
        if v.y < -1.22 and v.z < 1.95:
            v.z = 1.95 - (1.95 - v.z) * 0.35
        # Slimmer, tendon-thin lower shins.
        if v.z < 0.55 and abs(v.x) > 0.15:
            cx = 0.245 if v.x > 0 else -0.245
            v.x = cx + (v.x - cx) * 0.9
        return v

    def paint(p: Vector, n: Vector, b: Builder):
        col = SCALE
        # Darker along the top, banded scales down the back and tail.
        top = ss(0.2, 0.85, n.z)
        col = mix(col, SCALE_TOP, top)
        if n.z > 0.25 and p.y > -0.8:
            band = (p.y / 0.11) % 1.0
            if band < 0.28:
                col = tuple(c * 0.78 for c in col)
        # Pale underside: throat, chest, belly, the inside of the thighs.
        under = 0.0
        if -0.85 < p.y < 0.55 and p.z > 0.82 and abs(p.x) < 0.3:
            under = ss(0.05, -0.5, n.z)
        if -1.08 < p.y < -0.62 and p.z > 1.25:
            # The neck leans forward: its throat faces forward and down.
            under = max(under, ss(-0.05, -0.55, n.y * 0.8 + n.z * 0.6) * (1 - ss(0.06, 0.11, abs(p.x))))
        if p.y < -1.05 and p.z < 1.97:
            under = max(under, ss(0.0, -0.6, n.z))
        if p.y > 0.55 and p.z > 0.8:
            under = max(under, 0.55 * ss(-0.1, -0.7, n.z))
        col = mix(col, BELLY, under)
        # Feet: dark, rough scutes.
        if p.z < 0.32 and abs(p.x) > 0.12:
            col = mix(col, FOOT, ss(0.32, 0.22, p.z))
        return col

    def parts(b: Builder) -> list[Part]:
        out: list[Part] = []
        # --- Mouth: jaw, interior, teeth, nostrils.
        jaw = b.tube("pat_jaw", [V(0, -1.12, 1.93), V(0, -1.3, 1.915), V(0, -1.45, 1.905), V(0, -1.57, 1.905)], [0.085, 0.078, 0.06, 0.034], "jawscale", sides=12)
        out.append(Part(jaw, "jaw"))
        out.append(Part(b.ellipsoid("pat_mouth", V(0, -1.38, 1.935), V(0.044, 0.19, 0.016), "mouth", axis=V(0, 0, 1)), "head"))
        for s in (1, -1):
            pts = [V(0.048 * s - 0.01 * s * k / 6, -1.25 - k * 0.045, 1.945) for k in range(7)]
            t = kit.teeth_row(b, f"pat_teeth{s}", pts, V(0, -0.15, -1), 0.026, 0.008, "teeth")
            if t:
                out.append(Part(t, "head"))
            out.append(Part(b.ellipsoid(f"pat_nostril{s}", V(0.032 * s, -1.575, 1.985), V(0.012, 0.018, 0.008), "pupil", axis=V(0.3 * s, -0.4, 1)), "head"))
        # --- Eyes: gold, slit pupils, a dark lid ring.
        for s in (1, -1):
            hit = kit.surface(b, V(0.6 * s, -1.2, 2.06), V(-s, 0, 0), -0.004)
            ec = hit[0] if hit else V(0.09 * s, -1.2, 2.06)
            out.append(Part(b.ellipsoid(f"pat_lid{s}", ec, V(0.012, 0.036, 0.026), "lid"), "head"))
            out.append(Part(b.ellipsoid(f"pat_eye{s}", ec + V(0.004 * s, 0, 0), V(0.012, 0.03, 0.021), "eye"), "head"))
            out.append(Part(b.ellipsoid(f"pat_pupil{s}", ec + V(0.012 * s, -0.002, 0), V(0.004, 0.005, 0.018), "pupil"), "head"))
        # --- Plumes. A crest swept back from the skull...
        crest = []
        for i in range(9):
            u = i / 8 - 0.5
            root = V(0.025 * u * 2, -1.05 + 0.02 * abs(u), 2.13 - 0.03 * abs(u))
            d = V(u * 0.5, 0.85, 0.42 - abs(u) * 0.3)
            crest.append((root, d, 0.34 - 0.12 * abs(u) * 2, 0.07))
        cr = kit.blades(b, "pat_crest", crest, "plume", curl=-0.5, droop=0.25)
        if cr:
            out.append(Part(cr, "head"))
        # ...cheek plumes behind the jaw...
        cheeks = []
        for s in (1, -1):
            for k in range(4):
                cheeks.append((V(0.085 * s, -1.06 + 0.02 * k, 1.97 + 0.03 * k), V(0.45 * s, 0.85, 0.05 + 0.1 * k), 0.17 - 0.02 * k, 0.05))
        ck = kit.blades(b, "pat_cheeks", cheeks, "plume", curl=-0.3, droop=0.2)
        if ck:
            out.append(Part(ck, "head"))
        # ...a mane down the back of the neck...
        mane = []
        path = [(V(0, -1.02, 2.05), 0.22), (V(0, -0.98, 1.92), 0.24), (V(0, -0.93, 1.78), 0.25), (V(0, -0.86, 1.64), 0.26), (V(0, -0.78, 1.52), 0.24), (V(0, -0.7, 1.44), 0.2), (V(0, -0.62, 1.38), 0.16)]
        for i, (q, ln) in enumerate(path):
            hit = kit.surface(b, q + V(0, 0.6, 0.35), V(0, -0.85, -0.5), 0.0)
            if not hit:
                continue
            for s in (-1, 0, 1):
                root = hit[0] + V(0.03 * s, 0, -0.01)
                d = V(0.35 * s, 0.75, 0.45 - 0.05 * i)
                mane.append((root, d, ln * (0.85 if s else 1.0), 0.065))
        mn = kit.blades(b, "pat_mane", mane, "plume", curl=-0.35, droop=0.35)
        if mn:
            out.append(Part(mn, None))
        # ...and a fan at the tail tip.
        tail = []
        tip = b.p("tail5")
        for i in range(11):
            u = i / 10 - 0.5
            a = u * 1.6
            d = V(math.sin(a) * 0.6, 1.0, 0.25 + 0.25 * math.cos(a * 2))
            tail.append((tip + V(0.01 * u, -0.06 + 0.04 * abs(u), 0.02), d, 0.42 - 0.18 * abs(u), 0.075))
        tl = kit.blades(b, "pat_tailplume", tail, "plume", curl=-0.25, droop=0.3)
        if tl:
            out.append(Part(tl, "tail5"))
        # --- Claws: a raised sickle on the inner toe, hooks on the others, small hand claws.
        for s in (1, -1):
            sfx = ".L" if s > 0 else ".R"
            for toe, (dirn, ln, rad, hook) in {
                "toe_c": (V(0, -1, -0.25), 0.075, 0.017, 1.2),
                "toe_o": (V(0.35 * s, -1, -0.25), 0.06, 0.015, 1.1),
                "toe_i": (V(-0.2 * s, -0.7, 0.55), 0.1, 0.019, 1.8),
            }.items():
                tp = b.p(toe + sfx)
                out.append(Part(kit.claw(b, f"pat_claw_{toe}{s}", tp + V(0, -0.018, 0.0), dirn, ln, rad, "claw", hook=hook), "toe" + sfx))
            hp = b.p("hand" + sfx)
            for k in (-1, 0, 1):
                out.append(Part(kit.claw(b, f"pat_hclaw{k}{s}", hp + V(0.012 * k, -0.01, -0.01), V(0.25 * k, -0.6, -1.0), 0.05, 0.009, "claw", hook=1.0), "hand" + sfx))
            # Scutes on the shins.
            sc = []
            for k in range(6):
                z = 0.12 + 0.045 * k
                hit = kit.surface(b, V(0.245 * s, -0.6, z + 0.05 * (k / 5)), V(0, 1, 0), 0.0)
                if hit:
                    sc.append((hit[0] + V(0, 0, 0.012), V(0, -0.3, -1), 0.04, 0.05))
            scu = kit.blades(b, f"pat_scutes{s}", sc, "jawscale", curl=0.1, droop=0.0, spine=0.12, steps=3, thickness=0.004)
            if scu:
                out.append(Part(scu, None))

        # --- Tack. The leather visor over brow and nose, ending in a beak.
        def visor(p, n):
            # The top of the head from the poll to the nose, clear of the eyes.
            if not (-1.58 < p.y < -1.07 and p.z > 1.98):
                return False
            if -1.3 < p.y < -1.1:  # leave the eyes clear
                return p.z > 2.105 and n.z > 0.45
            return n.z > 0.3 or (p.y < -1.3 and n.z > 0.0)

        vs = kit.body_shell(b, "pat_visor", visor, 0.012, "leather", lip=0.01)
        out.append(Part(vs, None))
        beak = b.tube("pat_beak", [V(0, -1.47, 2.03), V(0, -1.56, 2.0), V(0, -1.64, 1.955), V(0, -1.69, 1.915)], [0.05, 0.043, 0.026, 0.004], "leather", sides=10)
        for v in beak.data.vertices:
            v.co.x *= 0.85
        out.append(Part(beak, "head"))
        rv = kit.studs(b, "pat_visor_rivets", [(V(0.6 * s, y, 2.06), V(-s, 0, 0)) for s in (1, -1) for y in (-1.32, -1.4, -1.48)], 0.009, "gold", lift=0.018)
        if rv:
            out.append(Part(rv, "head"))
        # Bridle: noseband, cheek pieces, brow band, throatlatch, bit rings.
        nb, _ = kit.girth(b, "pat_noseband", V(0, -1.42, 1.96), V(0, 1, 0.1), 0.028, "leather_dark", lift=0.016)
        out.append(Part(nb, "head"))
        bb, _ = kit.girth(b, "pat_browband", V(0, -1.08, 2.04), V(0, 1, -0.35), 0.026, "leather_dark", lift=0.018)
        out.append(Part(bb, "head"))
        tl_, _ = kit.girth(b, "pat_throatlatch", V(0, -0.99, 1.9), V(0, 0.5, 1), 0.022, "leather_dark", lift=0.014)
        out.append(Part(tl_, None))
        for s in (1, -1):
            cp = kit.strap_path(b, f"pat_cheekpiece{s}", [(V(0.6 * s, -1.42 + 0.32 * k / 6, 1.95 + 0.11 * k / 6), V(-s, 0, 0)) for k in range(7)], 0.022, "leather_dark", lift=0.017)
            if cp:
                out.append(Part(cp, "head"))
            out.append(Part(kit.ring(b, f"pat_bit{s}", V(0.082 * s, -1.3, 1.925), V(1, 0, 0), 0.022, 0.0045, "gold"), "head"))
            # Reins: from the bit along the neck to the saddle's pommel.
            path = []
            for k in range(14):
                t = k / 13
                y = -1.3 + (-0.62 + 1.3) * t
                z = 1.925 + (1.5 - 1.925) * t - 0.08 * math.sin(math.pi * t)
                path.append((V(0.8 * s, y, z), V(-s, 0, 0)))
            rn = kit.strap_path(b, f"pat_rein{s}", path, 0.018, "leather_dark", lift=0.03, thickness=0.006)
            if rn:
                out.append(Part(rn, None))
        # Saddle: red pad, leather seat with pommel and cantle, flaps, stirrups.
        pad = kit.body_shell(b, "pat_pad", lambda p, n: -0.68 < p.y < -0.06 and n.z > 0.3 and p.z > 1.2 and abs(p.x) < 0.23, 0.018, "pad", lip=0.012)
        out.append(Part(pad, None))

        def seat_extra(p, n):
            return 0.07 * ss(-0.48, -0.62, p.y) + 0.08 * ss(-0.24, -0.1, p.y) * (1 - ss(0.04, 0.12, abs(p.x)))

        seat = kit.body_shell(b, "pat_seat", lambda p, n: -0.62 < p.y < -0.1 and n.z > 0.45 and abs(p.x) < 0.16, 0.036, "leather", extra=seat_extra, lip=0.016)
        out.append(Part(seat, None))
        flaps = kit.body_shell(b, "pat_flaps", lambda p, n: -0.5 < p.y < -0.2 and -0.25 < n.z < 0.55 and abs(p.x) > 0.1 and p.z > 1.0, 0.03, "leather", lip=0.01)
        out.append(Part(flaps, None))
        for s in (1, -1):
            st = kit.strap_path(b, f"pat_stirrup_leather{s}", [(V(0.7 * s, -0.36, z), V(-s, 0, 0)) for z in (1.28, 1.18, 1.08, 0.98)], 0.022, "leather_dark", lift=0.045)
            if st:
                out.append(Part(st, "spine"))
            out.append(Part(kit.ring(b, f"pat_stirrup{s}", V(0.27 * s, -0.36, 0.92), V(0, 1, 0), 0.05, 0.008, "steel"), "spine"))
        # Girth and breast collar with gold buckles.
        gt, gpts = kit.girth(b, "pat_girth", V(0, -0.3, 1.18), V(0, 1, 0), 0.06, "leather", lift=0.022)
        out.append(Part(gt, None))
        bc = kit.strap_path(b, "pat_breastcollar", [(V(0, -0.5, 1.28), V(math.sin(math.radians(a)), -math.cos(math.radians(a)), -0.1)) for a in range(-105, 106, 10)], 0.05, "leather", lift=0.02)
        if bc:
            out.append(Part(bc, None))
        bk = kit.studs(b, "pat_buckles", [(V(0.8, -0.3, 1.12), V(-1, 0, 0)), (V(0.8, -0.56, 1.3), V(-1, 0.25, 0)), (V(0, -1.2, 1.3), V(0, 1, 0))], 0.026, "gold", lift=0.034, flat=0.35)
        if bk:
            out.append(Part(bk, None))
        # Leather wraps round the tail.
        for i, (node, w) in enumerate((("tail1", 0.07), ("tail2", 0.05), ("tail3", 0.045))):
            c = b.p(node)
            nxt = b.p({"tail1": "tail2", "tail2": "tail3", "tail3": "tail4"}[node])
            wr, _ = kit.girth(b, f"pat_tailwrap{i}", c + (nxt - c) * 0.3, nxt - c, w, "leather", lift=0.014)
            out.append(Part(wr, None))
        return out

    return CreatureSpec(
        id="patrasche",
        nodes=nodes,
        edges=edges,
        root_node="pelvis",
        bones=bones,
        palette={
            "body": ("#ffffff", "cloth"),
            "jawscale": ("#2a2c37", "cloth"),
            "plume": ("#1c1d27", "hair"),
            "claw": ("#cfc4ae", "cloth"),
            "teeth": ("#efe8d8", "cloth"),
            "eye": ("#f2c330", "eye"),
            "lid": ("#121218", "cloth"),
            "pupil": ("#100c08", "cloth"),
            "mouth": ("#5a1e24", "skin"),
            "leather": ("#77502f", "cloth"),
            "leather_dark": ("#4e3320", "cloth"),
            "pad": ("#8a2632", "cloth"),
            "gold": ("#d3a948", "metal"),
            "steel": ("#a9adb6", "metal"),
        },
        zone=zone,
        parts=parts,
        sculpt=sculpt,
        paint=paint,
        meta={"name": "Patrasche", "kind": "land_dragon"},
    )


patrasche = _spec  # noqa: F811

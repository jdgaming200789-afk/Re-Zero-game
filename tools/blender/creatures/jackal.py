"""Dune jackal — a witchbeast of the Augria Dunes.

An oversized, rangy desert canid: a deep chest over a sharply tucked
waist, long angular legs (shoulder-elbow-wrist in front, stifle and a high
hock behind), a long narrow muzzle full of fangs, tall ragged ears and a
single horn swept back from the brow. Sandy coat with a dark saddle down
the spine, a pale throat and belly, dark socks and muzzle. A ragged black
mane bristles from the nape down the back; ruffs at the cheeks, chest and
elbows; a bushy, dark-tipped tail. The eyes burn red.
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


SAND = (0.72, 0.56, 0.37)
SADDLE = (0.33, 0.24, 0.18)
PALE = (0.86, 0.78, 0.62)
SOCK = (0.24, 0.19, 0.16)


def dune_jackal() -> CreatureSpec:
    nodes = {
        "pelvis": (V(0, 0.42, 0.8), 0.13, 0.15),
        "belly": (V(0, 0.12, 0.81), 0.115, 0.13),
        "chest": (V(0, -0.2, 0.82), 0.16, 0.235),
        "withers": (V(0, -0.38, 0.92), 0.135, 0.165),
        "neck0": (V(0, -0.5, 1.02), 0.098, 0.115),
        "neck1": (V(0, -0.6, 1.1), 0.082, 0.088),
        "skull": (V(0, -0.7, 1.16), 0.092, 0.084),
        "snout": (V(0, -0.86, 1.115), 0.048, 0.046),
        "nose": (V(0, -0.98, 1.085), 0.025, 0.025),
        "tail0": (V(0, 0.6, 0.82), 0.065, 0.065),
        "tail1": (V(0, 0.8, 0.74), 0.06, 0.06),
        "tail2": (V(0, 0.98, 0.64), 0.05, 0.05),
        "tail3": (V(0, 1.13, 0.54), 0.035, 0.035),
        "tail_tip": (V(0, 1.25, 0.47), 0.012, 0.012),
        "hip.L": (V(0.095, 0.42, 0.74), 0.13, 0.145),
        "knee.L": (V(0.11, 0.26, 0.52), 0.074, 0.08),
        "shank.L": (V(0.11, 0.38, 0.4), 0.048, 0.052),
        "hock.L": (V(0.11, 0.5, 0.28), 0.038, 0.04),
        "hmeta.L": (V(0.11, 0.47, 0.15), 0.033, 0.035),
        "hball.L": (V(0.11, 0.44, 0.045), 0.036, 0.032),
        "htoe.L": (V(0.11, 0.34, 0.024), 0.028, 0.024),
        "fsh.L": (V(0.1, -0.28, 0.72), 0.095, 0.11),
        "elbow.L": (V(0.11, -0.22, 0.47), 0.054, 0.058),
        "wrist.L": (V(0.11, -0.27, 0.19), 0.031, 0.033),
        "fball.L": (V(0.11, -0.3, 0.05), 0.034, 0.03),
        "ftoe.L": (V(0.11, -0.4, 0.024), 0.028, 0.024),
    }
    edges = [
        ("pelvis", "belly"), ("belly", "chest"), ("chest", "withers"), ("withers", "neck0"), ("neck0", "neck1"),
        ("neck1", "skull"), ("skull", "snout"), ("snout", "nose"),
        ("pelvis", "tail0"), ("tail0", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"), ("tail3", "tail_tip"),
        ("pelvis", "hip.L"), ("hip.L", "knee.L"), ("knee.L", "shank.L"), ("shank.L", "hock.L"), ("hock.L", "hmeta.L"), ("hmeta.L", "hball.L"), ("hball.L", "htoe.L"),
        ("chest", "fsh.L"), ("fsh.L", "elbow.L"), ("elbow.L", "wrist.L"), ("wrist.L", "fball.L"), ("fball.L", "ftoe.L"),
    ]
    bones = [
        ("hips", "pelvis", "belly", "root"),
        ("spine", "belly", "chest", "hips"),
        ("chest", "chest", "withers", "spine"),
        ("neck0", "withers", "neck0", "chest"),
        ("neck1", "neck0", "neck1", "neck0"),
        ("head", "neck1", "nose", "neck1"),
        ("jaw", "skull", "nose", "head"),
        ("tail0", "tail0", "tail1", "hips"),
        ("tail1", "tail1", "tail2", "tail0"),
        ("tail2", "tail2", "tail3", "tail1"),
        ("tail3", "tail3", "tail_tip", "tail2"),
        ("thigh.L", "hip.L", "knee.L", "hips"),
        ("shin.L", "knee.L", "hock.L", "thigh.L"),
        ("meta.L", "hock.L", "hball.L", "shin.L"),
        ("toe.L", "hball.L", "htoe.L", "meta.L"),
        ("arm.L", "fsh.L", "elbow.L", "chest"),
        ("forearm.L", "elbow.L", "wrist.L", "arm.L"),
        ("pastern.L", "wrist.L", "fball.L", "forearm.L"),
        ("paw.L", "fball.L", "ftoe.L", "pastern.L"),
    ]

    def zone(c: ZoneCtx) -> str:
        return "body"

    def sculpt(v: Vector, b: Builder) -> Vector:
        # Narrow, deep chest; a hard tuck up under the waist.
        if -0.45 < v.y < 0.55 and v.z > 0.6:
            v.x *= 0.8
        if -0.05 < v.y < 0.38 and v.z < 0.78 and abs(v.x) < 0.13:
            k = 1 - abs(v.y - 0.17) / 0.22
            v.z += (0.78 - v.z) * 0.45 * max(0.0, k)
        # Shoulder blades and haunches.
        for s in (1, -1):
            for c, r, amt in ((V(0.1 * s, -0.3, 0.86), 0.09, 0.018), (V(0.1 * s, 0.4, 0.8), 0.1, 0.02)):
                d = (v - c).length
                if d < r and v.x * s > 0:
                    v.x += s * amt * (1 - d / r)
        # Long, narrow muzzle; the lower half belongs to the jaw.
        if v.y < -0.72 and v.z > 1.0:
            v.x *= 0.8
        if v.y < -0.78 and v.z < 1.09:
            v.z = 1.09 - (1.09 - v.z) * 0.3
        # Stop: a dip where the muzzle meets the brow.
        if -0.82 < v.y < -0.74 and v.z > 1.14:
            v.z -= 0.012 * (1 - abs(v.y + 0.78) / 0.04)
        return v

    def paint(p: Vector, n: Vector, b: Builder):
        col = SAND
        # Dark saddle along the spine, fading down the flanks.
        if p.y > -0.55 and p.z > 0.55:
            col = mix(col, SADDLE, ss(0.35, 0.85, n.z) * (1 - ss(0.5, 0.75, p.y - 0.55) * 0))
        if p.y > 0.55:  # tail: darker on top, black tip
            col = mix(col, SADDLE, ss(0.0, 0.6, n.z) * 0.7)
            col = mix(col, (0.12, 0.1, 0.09), ss(1.0, 1.15, p.y))
        # Pale belly, chest and throat.
        under = 0.0
        if -0.5 < p.y < 0.45 and p.z > 0.45:
            under = ss(0.0, -0.55, n.z)
        if -0.75 < p.y < -0.4 and p.z > 0.85:
            under = max(under, ss(-0.05, -0.6, n.y * 0.6 + n.z * 0.8))
        if p.y < -0.68 and p.z < 1.13:
            under = max(under, ss(0.0, -0.6, n.z) * 0.8)
        col = mix(col, PALE, under)
        # Dark socks and a dark muzzle.
        if p.z < 0.3:
            col = mix(col, SOCK, ss(0.3, 0.18, p.z))
        if p.y < -0.88:
            col = mix(col, (0.18, 0.14, 0.12), ss(-0.88, -0.96, p.y))
        return col

    def parts(b: Builder) -> list[Part]:
        out: list[Part] = []
        jaw = b.tube("jk_jaw", [V(0, -0.72, 1.075), V(0, -0.84, 1.058), V(0, -0.96, 1.045)], [0.046, 0.036, 0.02], "jawfur", sides=10)
        out.append(Part(jaw, "jaw"))
        out.append(Part(b.ellipsoid("jk_mouth", V(0, -0.85, 1.08), V(0.026, 0.12, 0.01), "mouth"), "head"))
        out.append(Part(b.ellipsoid("jk_nose", V(0, -0.995, 1.095), V(0.022, 0.016, 0.016), "nose"), "head"))
        for s in (1, -1):
            up = [V(0.024 * s, -0.79 - k * 0.04, 1.082) for k in range(5)]
            t = kit.teeth_row(b, f"jk_teeth_u{s}", up, V(0, -0.1, -1), 0.018, 0.005, "teeth")
            if t:
                out.append(Part(t, "head"))
            lo = [V(0.021 * s, -0.8 - k * 0.04, 1.066) for k in range(4)]
            t = kit.teeth_row(b, f"jk_teeth_l{s}", lo, V(0, -0.1, 1), 0.015, 0.0045, "teeth")
            if t:
                out.append(Part(t, "jaw"))
            # Long canines.
            out.append(Part(kit.claw(b, f"jk_fang{s}", V(0.026 * s, -0.94, 1.085), V(0, -0.3, -1), 0.04, 0.008, "teeth", hook=0.4), "head"))
            # Burning eyes in a dark socket.
            hit = kit.surface(b, V(0.5 * s, -0.79, 1.18), V(-s, 0.4, 0), -0.002)
            ec = hit[0] if hit else V(0.055 * s, -0.79, 1.18)
            out.append(Part(b.ellipsoid(f"jk_socket{s}", ec, V(0.01, 0.026, 0.016), "socket", axis=V(0, 0.3, 1)), "head"))
            out.append(Part(b.ellipsoid(f"jk_eye{s}", ec + V(0.004 * s, -0.004, 0.001), V(0.008, 0.017, 0.009), "eye"), "head"))
            # Tall, ragged ears with dark insides.
            base = V(0.052 * s, -0.66, 1.21)
            ear = b.cone(f"jk_ear{s}", base, V(0.28 * s, 0.38, 1.0), 0.17, 0.05, "earfur", flat=0.32)
            out.append(Part(ear, "head"))
            inner = b.cone(f"jk_earin{s}", base + V(0.004 * s, -0.012, 0.01), V(0.28 * s, 0.38, 1.0), 0.13, 0.034, "socket", flat=0.18)
            out.append(Part(inner, "head"))
            # Claws.
            for toe, bone in (("htoe.L", "toe"), ("ftoe.L", "paw")):
                tp = b.p(toe if s > 0 else toe[:-2] + ".R")
                for k in (-1, 0, 1):
                    out.append(Part(kit.claw(b, f"jk_claw{toe}{k}{s}", tp + V(0.014 * k, -0.012, -0.004), V(0.2 * k, -1.0, -0.35), 0.032, 0.006, "horn", hook=1.0), f"{bone}.L" if s > 0 else f"{bone}.R"))
        # The horn: a single ridged spike swept back from the forehead.
        horn_pts = [V(0, -0.74, 1.21), V(0, -0.72, 1.3), V(0, -0.65, 1.37), V(0, -0.55, 1.41), V(0, -0.47, 1.42)]
        out.append(Part(b.tube("jk_horn", horn_pts, [0.03, 0.024, 0.015, 0.007, 0.002], "horn", sides=8), "head"))
        # Mane: ragged dark locks from the nape down the back.
        mane = []
        path = [V(0, -0.66, 1.2), V(0, -0.58, 1.14), V(0, -0.5, 1.08), V(0, -0.42, 1.02), V(0, -0.32, 0.98), V(0, -0.2, 0.96), V(0, -0.05, 0.92), V(0, 0.1, 0.9), V(0, 0.25, 0.9)]
        for i, q in enumerate(path):
            hit = kit.surface(b, q + V(0, 0.2, 0.6), V(0, -0.25, -1), 0.0)
            if not hit:
                continue
            ln = 0.14 * (1.15 - i / len(path) * 0.6)
            for s in (-1, 0, 1):
                mane.append((hit[0] + V(0.018 * s, 0, -0.008), V(0.45 * s, 0.7, 0.55), ln * (0.8 if s else 1.0), 0.04))
        mn = kit.blades(b, "jk_mane", mane, "mane", curl=-0.4, droop=0.25, thickness=0.003)
        if mn:
            out.append(Part(mn, None))
        # Ruffs: cheeks, chest, elbows.
        ruff = []
        for s in (1, -1):
            for k in range(4):
                ruff.append((V(0.07 * s, -0.66 + 0.015 * k, 1.1 - 0.025 * k), V(0.5 * s, 0.8, -0.15 - 0.1 * k), 0.08, 0.035))
            for k in range(3):
                hit = kit.surface(b, V(0.6 * s, -0.22 + 0.03 * k, 0.5), V(-s, 0, 0), 0.0)
                if hit:
                    ruff.append((hit[0], V(0.3 * s, 0.9, -0.3), 0.07, 0.03))
        for k in range(5):
            hit = kit.surface(b, V(0.03 * (k - 2), -1.0, 0.92 - 0.05 * k), V(0, 1, 0.2), 0.0)
            if hit:
                ruff.append((hit[0], V(0.2 * (k - 2), -0.25, -1.0), 0.09, 0.04))
        rf = kit.blades(b, "jk_ruff", ruff, "jawfur", curl=-0.3, droop=0.2, thickness=0.003)
        if rf:
            out.append(Part(rf, None))
        # Bushy tail.
        tail = []
        for node, nxt, ln in (("tail0", "tail1", 0.1), ("tail1", "tail2", 0.13), ("tail2", "tail3", 0.14), ("tail3", "tail_tip", 0.12)):
            a, c = b.p(node), b.p(nxt)
            ax = (c - a).normalized()
            for k in range(8):
                ang = 2 * math.pi * k / 8 + (0.4 if node in ("tail1", "tail3") else 0)
                ref = V(1, 0, 0)
                u = ax.cross(ref).normalized()
                w = ax.cross(u).normalized()
                r = u * math.cos(ang) + w * math.sin(ang)
                hit = kit.surface(b, a.lerp(c, 0.5), r, -0.004)
                if hit:
                    tail.append((hit[0], (ax * 1.0 + r * 0.55), ln, 0.05))
        tl = kit.blades(b, "jk_tailfur", tail, "tailfur", curl=-0.2, droop=0.15, thickness=0.003)
        if tl:
            out.append(Part(tl, None))
        return out

    return CreatureSpec(
        id="dune_jackal",
        nodes=nodes,
        edges=edges,
        root_node="pelvis",
        bones=bones,
        palette={
            "body": ("#ffffff", "cloth"),
            "jawfur": ("#cbb38a", "hair"),
            "earfur": ("#6a4c35", "cloth"),
            "mane": ("#231b17", "hair"),
            "tailfur": ("#5c4330", "hair"),
            "horn": ("#e4d8c0", "cloth"),
            "eye": ("#ff3a2c", "eye"),
            "socket": ("#1a1210", "cloth"),
            "nose": ("#151112", "cloth"),
            "mouth": ("#4a1418", "skin"),
            "teeth": ("#f0e7d6", "cloth"),
        },
        zone=zone,
        parts=parts,
        sculpt=sculpt,
        paint=paint,
        meta={"name": "Dune Jackal", "kind": "witchbeast"},
    )

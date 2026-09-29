"""Creature specs. Patrasche first; the dune jackals and the Sand Earthworm
join in the combat phase."""
from __future__ import annotations

import math

import bpy  # noqa: F401
from mathutils import Vector

from creature import Builder, CreatureSpec, Part, ZoneCtx


def V(x: float, y: float, z: float) -> Vector:
    return Vector((x, y, z))


# --------------------------------------------------------------------------- Patrasche

def patrasche() -> CreatureSpec:
    """Patrasche: a Diana-type land dragon. Bipedal and raptor-like,
    jet-black scales, gold slit eyes, crest horns swept back, dorsal spines;
    a leather harness and a crimson blanket from pulling the carriage."""
    nodes = {
        # Torso (y back, z up); the body leans forward over the hips.
        "pelvis": (V(0, 0.25, 1.08), 0.23, 0.25),
        "belly": (V(0, -0.1, 1.07), 0.29, 0.31),
        "chest": (V(0, -0.45, 1.15), 0.27, 0.3),
        "withers": (V(0, -0.68, 1.26), 0.22, 0.24),
        "neck0": (V(0, -0.88, 1.42), 0.19, 0.2),
        "neck1": (V(0, -1.0, 1.6), 0.16, 0.165),
        "neck2": (V(0, -1.08, 1.76), 0.14, 0.14),
        "skull": (V(0, -1.2, 1.9), 0.15, 0.14),
        "snout": (V(0, -1.44, 1.88), 0.1, 0.09),
        "nose": (V(0, -1.63, 1.85), 0.06, 0.055),
        # Tail
        "tail0": (V(0, 0.56, 1.07), 0.18, 0.19),
        "tail1": (V(0, 0.9, 1.02), 0.135, 0.14),
        "tail2": (V(0, 1.27, 0.96), 0.1, 0.105),
        "tail3": (V(0, 1.64, 0.88), 0.072, 0.075),
        "tail4": (V(0, 2.0, 0.8), 0.05, 0.052),
        "tail5": (V(0, 2.34, 0.74), 0.03, 0.032),
        "tail_tip": (V(0, 2.6, 0.7), 0.012, 0.012),
        # Legs (digitigrade)
        "hip.L": (V(0.2, 0.18, 1.0), 0.19, 0.2),
        "thigh.L": (V(0.23, 0.02, 0.8), 0.15, 0.155),
        "knee.L": (V(0.24, -0.14, 0.6), 0.095, 0.1),
        "shin.L": (V(0.24, -0.01, 0.43), 0.07, 0.072),
        "ankle.L": (V(0.24, 0.12, 0.26), 0.055, 0.058),
        "ball.L": (V(0.24, 0.02, 0.07), 0.055, 0.05),
        "toe_c.L": (V(0.245, -0.22, 0.035), 0.034, 0.03),
        "toe_i.L": (V(0.185, -0.17, 0.035), 0.03, 0.027),
        "toe_o.L": (V(0.31, -0.16, 0.035), 0.03, 0.027),
        # Small forelimbs
        "shoulder.L": (V(0.16, -0.62, 1.12), 0.07, 0.075),
        "elbow.L": (V(0.21, -0.67, 0.91), 0.052, 0.055),
        "wrist.L": (V(0.2, -0.8, 0.81), 0.038, 0.04),
        "hand.L": (V(0.19, -0.89, 0.78), 0.03, 0.03),
    }
    # Taller stance: lift everything above the legs, lengthen the legs.
    lift = 0.1
    for k, (pos, a, b) in list(nodes.items()):
        if not any(k.startswith(x) for x in ("hip.", "thigh.", "knee.", "shin.", "ankle.", "ball.", "toe_")):
            nodes[k] = (pos + V(0, 0, lift), a, b)
    nodes.update({
        "hip.L": (V(0.2, 0.18, 1.1), 0.21, 0.22),
        "thigh.L": (V(0.235, 0.02, 0.88), 0.17, 0.175),
        "knee.L": (V(0.245, -0.13, 0.66), 0.1, 0.105),
        "shin.L": (V(0.245, 0.0, 0.47), 0.072, 0.075),
        "ankle.L": (V(0.245, 0.13, 0.3), 0.056, 0.06),
    })
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
        p, n = c.p, c.n
        torso = -0.8 < p.y < 0.9 and p.z > 0.85 and abs(p.x) < 0.3
        if torso and n.z < -0.6:
            return "belly"
        # Throat: the front of the neck, lighter like the belly.
        if -1.15 < p.y < -0.7 and n.y < -0.35 and n.z < 0.3 and p.z < 1.85:
            return "belly"
        return "scales"

    def sculpt(v: Vector, b: Builder) -> Vector:
        # Deep, narrow torso (not a tube): squeeze sideways, keep the keel.
        if -0.8 < v.y < 0.6 and v.z > 0.8 and abs(v.x) < 0.34:
            v.x *= 0.9
        # Head: flatter sides, a defined brow above the eyes.
        if v.y < -1.1 and v.z > 1.82:
            v.x *= 0.88
            if v.z > 2.08 and -1.32 < v.y < -1.12:
                v.z += 0.015
        # The snout's lower half belongs to the separate jaw.
        if v.y < -1.24 and v.z < 1.94:
            v.z = 1.94 - (1.94 - v.z) * 0.35
        return v

    def parts(b: Builder) -> list[Part]:
        out: list[Part] = []
        # Lower jaw (opens for roars / snorts), mouth interior, teeth line.
        jaw = b.tube("pat_jaw", [V(0, -1.16, 1.9), V(0, -1.34, 1.89), V(0, -1.5, 1.88), V(0, -1.62, 1.88)], [0.09, 0.082, 0.062, 0.036], "scales", sides=12)
        out.append(Part(jaw, "jaw"))
        mouth = b.ellipsoid("pat_mouth", V(0, -1.4, 1.92), V(0.068, 0.22, 0.02), "mouth", axis=V(0, 0, 1))
        out.append(Part(mouth, "head"))
        # Eyes: gold with vertical slit pupils, set under the brow.
        for s in (1, -1):
            eye_c = V(0.098 * s, -1.27, 2.05)
            out.append(Part(b.ellipsoid(f"pat_eye{s}", eye_c, V(0.018, 0.028, 0.02), "eye"), "head"))
            pupil = b.ellipsoid(f"pat_pupil{s}", eye_c + V(0.017 * s, -0.004, 0), V(0.004, 0.006, 0.016), "pupil")
            out.append(Part(pupil, "head"))
            # Crest horns swept back over the neck.
            out.append(Part(b.cone(f"pat_horn{s}", V(0.07 * s, -1.14, 2.12), V(0.25 * s, 1.0, 0.35), 0.28, 0.034, "horn", flat=0.7), "head"))
            out.append(Part(b.cone(f"pat_hornb{s}", V(0.11 * s, -1.08, 2.03), V(0.5 * s, 1.0, 0.1), 0.16, 0.024, "horn", flat=0.7), "head"))
            # Claws: three toes and the hand.
            for toe in ("toe_c.L", "toe_i.L", "toe_o.L"):
                tp = b.p(toe if s > 0 else toe[:-2] + ".R")
                out.append(Part(b.cone(f"pat_claw{toe}{s}", tp + V(0, -0.02, -0.005), V(0.0, -1.0, -0.35), 0.06, 0.018, "claw"), "toe.L" if s > 0 else "toe.R"))
            hp = b.p("hand.L" if s > 0 else "hand.R")
            out.append(Part(b.cone(f"pat_hclaw{s}", hp, V(0, -0.6, -1.0), 0.045, 0.014, "claw"), "hand.L" if s > 0 else "hand.R"))
        # Dorsal spines along neck, back and tail.
        spine_path = [
            ("neck2", 0.06, "neck2"), ("neck1", 0.07, "neck1"), ("neck0", 0.08, "neck0"), ("withers", 0.09, "chest"),
            ("chest", 0.085, "chest"), ("belly", 0.075, "spine"), ("pelvis", 0.07, "hips"), ("tail0", 0.065, "tail0"),
            ("tail1", 0.055, "tail1"), ("tail2", 0.045, "tail2"), ("tail3", 0.035, "tail3"), ("tail4", 0.025, "tail4"),
        ]
        for node, size, bone in spine_path:
            p, ra, rb = b.nodes[node]
            top = b.surface_below(0, p.y, p.z + 1.0, 0.0) or p + V(0, 0, rb)
            out.append(Part(b.cone(f"pat_spine_{node}", top + V(0, 0.01, -0.01), V(0, 0.55, 1.0), size, size * 0.38, "horn", flat=0.35), bone))
        # Harness: a strap ring around the chest and one across the withers.
        for name, node, width, bone in (("chest", "chest", 0.05, "chest"), ("neck", "withers", 0.035, "chest")):
            p, ra, rb = b.nodes[node]
            ring = []
            for i in range(28):
                a = 2 * math.pi * i / 28
                d = V(math.cos(a), 0, math.sin(a))
                hit = b.bvh().ray_cast(p + d * 0.8, -d)
                ring.append((hit[0] + hit[1] * 0.012) if hit[0] is not None else p + d * (ra + 0.02))
            ring.append(ring[0])
            import bmesh as _bm

            bm = _bm.new()
            rows = [[bm.verts.new(q + V(0, -width / 2, 0)) for q in ring[:-1]], [bm.verts.new(q + V(0, width / 2, 0)) for q in ring[:-1]]]
            n = len(rows[0])
            for i in range(n):
                bm.faces.new((rows[0][i], rows[0][(i + 1) % n], rows[1][(i + 1) % n], rows[1][i]))
            strap = b.obj(f"pat_strap_{name}", bm, "leather")
            sol = strap.modifiers.new("Sol", "SOLIDIFY")
            sol.thickness = 0.008
            bpy.context.view_layer.objects.active = strap
            bpy.ops.object.modifier_apply(modifier=sol.name)
            out.append(Part(strap, bone))
            # Gold buckle on the left side
            buckle = b.ellipsoid(f"pat_buckle_{name}", ring[0] + V(0.01, 0, 0), V(0.012, 0.03, 0.03), "gold")
            out.append(Part(buckle, bone))
        # Crimson blanket over the back, dropped onto the body.
        import bmesh as _bm2

        bm = _bm2.new()
        cols, rows_n = 12, 8
        grid = []
        for r in range(rows_n + 1):
            y = -0.46 + 0.52 * r / rows_n
            row = []
            for c in range(cols + 1):
                x = (c / cols - 0.5) * 0.58
                q = b.surface_below(x, y, 2.5, 0.014)
                if q is None or q.z < 0.95:
                    q = V(x, y, 0.95 + (1.22 - 0.95) * (1 - abs(x) / 0.31))
                row.append(bm.verts.new(q))
            grid.append(row)
        for r in range(rows_n):
            for c in range(cols):
                bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
        blanket = b.obj("pat_blanket", bm, "blanket")
        sol = blanket.modifiers.new("Sol", "SOLIDIFY")
        sol.thickness = 0.01
        bpy.context.view_layer.objects.active = blanket
        bpy.ops.object.modifier_apply(modifier=sol.name)
        out.append(Part(blanket, "spine"))
        return out

    return CreatureSpec(
        id="patrasche",
        nodes=nodes,
        edges=edges,
        root_node="pelvis",
        bones=bones,
        palette={
            "scales": ("#2b2e3c", "cloth"),
            "belly": ("#4b4d5e", "cloth"),
            "horn": ("#1a1b24", "metal"),
            "claw": ("#d8cfbd", "cloth"),
            "eye": ("#f2c037", "eye"),
            "pupil": ("#120e08", "eye"),
            "mouth": ("#5a1e24", "skin"),
            "leather": ("#6b4a2e", "cloth"),
            "gold": ("#c9a040", "metal"),
            "blanket": ("#8a2b36", "cloth"),
        },
        zone=zone,
        parts=parts,
        sculpt=sculpt,
        meta={"name": "Patrasche", "kind": "land_dragon"},
    )


BESTIARY = {
    "patrasche": patrasche,
}

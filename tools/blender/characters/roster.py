"""Character specifications for the vertical slice cast.

Colours and details follow the source material (Subaru's white tracksuit
jacket with deep-grey shoulders/sleeves and orange stripes/cuffs; Beatrice's
pink frilled dress, drills and crown; Julius's Royal Guard uniform;
Emilia's white-and-purple outfit and half-elf ears; Ram's maid uniform;
Meili's triple braid; Anastasia's white gown and fox scarf; Shaula's
scorpion-tail ponytail and tattered cloak).
"""
from __future__ import annotations

import math

import bpy  # noqa: F401
from mathutils import Vector

from build import CharacterSpec
from hair import Clump, Drill, HairStyle, HeadFrame
from head import HeadSpec
from humanoid import BodySpec, Joints
from outfit import Garments, SkirtSpec, ZoneContext, apron, cape, ring_band, shoulder_collar, skirt
import accessories as acc

# --------------------------------------------------------------------------- shared zone helpers


def z_above(frac):
    return lambda c: c.p.z > frac * c.H


def is_skin_neck(c: ZoneContext) -> bool:
    return c.p.z > c.j.neck_base.z + 0.004 * c.H


def is_hand(c: ZoneContext) -> bool:
    return c.beyond_wrist()


def is_foot(c: ZoneContext, extra=0.0) -> bool:
    return c.p.z < c.j.ankle_l.z + (0.01 + extra) * c.H and abs(c.p.x) > 0.01 * c.H


def below_waist(c: ZoneContext, offset=0.0) -> bool:
    return c.p.z < c.j.waist.z + offset * c.H and not c.on_arm()


# --------------------------------------------------------------------------- Subaru

def subaru_hair() -> HairStyle:
    clumps = []
    # Fringe falling over the forehead to the brows, uneven and a bit messy.
    lengths = [0.62, 0.74, 0.68, 0.8, 0.7, 0.76, 0.6]
    for i, az in enumerate([-50, -34, -17, 0, 17, 34, 50]):
        clumps.append(
            Clump(az=az, el=58, direction=(math.sin(math.radians(az)) * 0.3, -0.85, -0.55), length=lengths[i], width=0.34, thickness=0.09, stiffness=0.35, gravity=1.2, curl=0.35 * (1 if az < 0 else -1), lift=0.012, twist=0.2 * (1 if i % 2 else -1))
        )
    # A second, shorter layer to fill the gaps between fringe clumps.
    for az in (-42, -25, -8, 8, 25, 42):
        clumps.append(Clump(az=az, el=52, direction=(0, -0.9, -0.45), length=0.5, width=0.3, thickness=0.08, stiffness=0.3, gravity=1.2, lift=0.006))
    # Sides over the ears.
    for az in (-78, -96, 78, 96):
        clumps.append(Clump(az=az, el=34, direction=(math.copysign(0.35, az), 0.1, -1), length=0.4, width=0.32, thickness=0.09, stiffness=0.4, lift=0.015))
    # Back: short, pointing down and out.
    for az in range(120, 250, 22):
        clumps.append(Clump(az=az, el=24, direction=(math.sin(math.radians(az)) * 0.5, 0.9, -0.45), length=0.46, width=0.36, thickness=0.1, stiffness=0.5, lift=0.01))
    for az in range(135, 240, 26):
        clumps.append(Clump(az=az, el=-8, direction=(math.sin(math.radians(az)) * 0.3, 0.5, -1), length=0.34, width=0.32, thickness=0.09, stiffness=0.4))
    # Crown: clumps lie along the scalp, flowing back and down from the whorl.
    for az in range(0, 360, 30):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=80, direction=(math.sin(a) * 0.8, -math.cos(a) * 0.8 + 0.35, -0.15), length=0.42, width=0.4, thickness=0.1, stiffness=0.25, gravity=0.8, lift=0.0, root_offset=0.004))
    clumps.append(Clump(az=170, el=62, direction=(0.2, 0.8, 0.55), length=0.34, width=0.26, thickness=0.08, stiffness=0.85))
    clumps.append(Clump(az=200, el=58, direction=(-0.3, 0.8, 0.45), length=0.32, width=0.24, thickness=0.08, stiffness=0.85))
    clumps.append(Clump(az=10, el=86, direction=(0.1, -0.4, 1.0), length=0.22, width=0.07, thickness=0.03, stiffness=0.6, curl=-2.5))  # ahoge
    return HairStyle(clumps=clumps, hairline_front=0.46)


def subaru_garments(j: Joints, mats: dict) -> Garments:
    H = j.H
    g = Garments()
    collar = ring_band("subaru_collar", Vector((0, j.neck_base.y + 0.002 * H, j.neck_base.z - 0.016 * H)), 0.043 * H, 0.041 * H, 0.028 * H, 0.12, mats["jacket"], thickness=0.004)
    collar["bone"] = "upperChest"
    g.objects.append(collar)
    return g


def subaru() -> CharacterSpec:
    body = BodySpec(height=1.73, heads_tall=6.4, shoulder=1.1, hips=0.97, waist=1.0, chest=1.08, limb=1.0, sleeve=1.25, sleeve_cuff=1.18, trouser=1.2, trouser_cuff=1.25, torso_cloth=1.12, shoe=1.2)
    rules = [
        ("skin", lambda c: is_skin_neck(c) or is_hand(c)),
        ("sole", lambda c: c.p.z < 0.012 * c.H),
        ("shoe", lambda c: is_foot(c, 0.005)),
        ("orange", lambda c: c.on_arm() and c.arm_s() > c.arm_len() - 0.03 * c.H),  # cuffs
        ("orange", lambda c: c.on_arm() and c.arm_up_dot() > 0.9),  # sleeve stripe
        ("grey", lambda c: c.on_arm()),
        # Open tracksuit jacket over a white shirt: the shirt shows in a clean strip down the front.
        ("grey", lambda c: c.p.z > c.j.waist.z - 0.03 * c.H and (abs(c.p.x) > 0.05 * c.H or c.p.y > c.j.chest.y + 0.01 * c.H)),
        ("orange", lambda c: below_waist(c, -0.02) and c.leg_side_dot() > 0.93 and abs(c.p.x) > 0.035 * c.H),  # trouser stripe
        ("trousers", lambda c: below_waist(c, -0.02)),
        ("jacket", lambda c: True),
    ]
    return CharacterSpec(
        id="subaru",
        body=body,
        head=HeadSpec(width=0.86, jaw=0.4, chin_point=0.3, cheek=0.15, nose=0.8),
        hair=subaru_hair(),
        palette={
            "skin": ("#f3d9c7", "skin"),
            "face": ("#f3d9c7", "face"),
            "hair": ("#1d1f29", "hair"),
            "jacket": ("#ecebe6", "cloth"),
            "grey": ("#3b3e46", "cloth"),
            "orange": ("#ec7a2c", "cloth"),
            "trousers": ("#3a3c44", "cloth"),
            "shoe": ("#1b1b20", "cloth"),
            "sole": ("#ec7a2c", "cloth"),
        },
        zones=rules,
        default_zone="jacket",
        face={"iris": "#2a2530", "irisLight": "#5b4f63", "eyeShape": "sanpaku", "brow": "#1d1f29", "lash": "#15151c", "eyeSize": 0.82},
        garments=subaru_garments,
        meta={"name": "Natsuki Subaru"},
        cuts=lambda j: [
            (Vector((0.05 * j.H, 0, 0)), Vector((1, 0, 0))),
            (Vector((-0.05 * j.H, 0, 0)), Vector((1, 0, 0))),
            (Vector((0, j.chest.y + 0.01 * j.H, 0)), Vector((0, 1, 0))),
            (Vector((0, 0, j.waist.z - 0.03 * j.H)), Vector((0, 0, 1))),
        ],
    )





# --------------------------------------------------------------------------- hair builders shared by the cast


def fringe(az_list, el, length, width=0.4, thick=0.085, stiff=0.35, lengths=None, tip=0, part=0.0, hold=0.5):
    """Bangs: broad locks with pointed tips. Alternate locks sweep slightly
    left/right and vary in length so the edge reads as hair, not teeth."""
    out = []
    for i, az in enumerate(az_list):
        ln = lengths[i] if lengths else length * (1.0 + 0.08 * math.sin(i * 2.3))
        side = math.sin(math.radians(az))
        sweep = 0.12 * (1 if i % 2 else -1)
        out.append(
            Clump(
                az=az,
                el=el,
                direction=(side * 0.3 + sweep + part * (1 if az > 0 else -1) * 0.3, -0.85, -0.55),
                length=ln,
                width=width * (0.9 + 0.2 * ((i * 7) % 3) / 2),
                thickness=thick,
                stiffness=stiff,
                gravity=1.2,
                curl=0.25 * (-1 if az > 0 else 1),
                lift=0.01,
                tip_material=tip,
                hold=hold,
                tip=1.8,
            )
        )
    return out


def crown_flow(length=0.5, width=0.4, step=30):
    out = []
    for az in range(0, 360, step):
        a = math.radians(az)
        out.append(Clump(az=az, el=80, direction=(math.sin(a) * 0.8, -math.cos(a) * 0.8 + 0.35, -0.15), length=length, width=width, thickness=0.1, stiffness=0.25, gravity=0.8, root_offset=0.004))
    return out


def long_back(length, az_from=100, az_to=260, step=16, chains=5, width=0.42, stiff=0.3, curl=0.0, tip=0, el_rows=(22, -5)):
    """Long hair falling down the back, grouped into spring chains."""
    out = []
    span = az_to - az_from
    for el in el_rows:
        for az in range(az_from, az_to + 1, step):
            ci = min(chains - 1, int((az - az_from) / max(1, span) * chains))
            a = math.radians(az)
            out.append(Clump(az=az, el=el, direction=(math.sin(a) * 0.35, 0.6, -0.8), length=length * (0.94 if el < 0 else 1.0), width=width, thickness=0.1, stiffness=stiff, gravity=1.3, curl=curl, lift=0.015, chain=f"hair_back{ci}", tip_material=tip))
    return out


def side_locks(length, el=28, width=0.3, chain=True, curl=0.0, tip=0):
    out = []
    for az in (-80, 80):
        out.append(Clump(az=az, el=el, direction=(math.copysign(0.25, az), -0.25, -1), length=length, width=width, thickness=0.09, stiffness=0.3, gravity=1.3, curl=curl, lift=0.012, chain=(f"hair_side{'L' if az > 0 else 'R'}" if chain else None), tip_material=tip))
    return out


def fem_body(**kw):
    base = dict(shoulder=0.86, hips=1.06, waist=0.8, chest=0.95, bust=0.45, limb=0.84)
    base.update(kw)
    return base


def skin_rules(extra_skin=None):
    rules = [("skin", lambda c: is_skin_neck(c) or is_hand(c))]
    if extra_skin:
        rules.append(("skin", extra_skin))
    return rules


# --------------------------------------------------------------------------- Emilia

def emilia() -> CharacterSpec:
    body = BodySpec(height=1.64, heads_tall=6.6, **fem_body(bust=0.5), sleeve=1.12, sleeve_cuff=1.2, torso_cloth=1.05, trouser=1.0, shoe=1.0)
    hair = HairStyle(
        clumps=fringe([-58, -40, -22, -7, 7, 22, 40, 58], 57, 0.62, width=0.36, lengths=[0.74, 0.64, 0.6, 0.66, 0.66, 0.6, 0.64, 0.74])
        + side_locks(1.9)
        + long_back(3.4)
        + crown_flow(0.55),
        hairline_front=0.46,
        chains={"hair_back0": 5, "hair_back1": 5, "hair_back2": 5, "hair_back3": 5, "hair_back4": 5, "hair_sideL": 4, "hair_sideR": 4},
    )

    def boots_top(c):
        return c.j.knee_l.z + 0.06 * c.H

    rules = skin_rules(lambda c: (not c.on_arm()) and boots_top(c) < c.p.z < c.j.hip_l.z - 0.02 * c.H) + [
        ("boot_trim", lambda c: (not c.on_arm()) and boots_top(c) - 0.02 * c.H < c.p.z <= boots_top(c)),
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= boots_top(c)),
        ("purple", lambda c: c.on_arm() and c.arm_s() > c.arm_len() - 0.035 * c.H),
        ("dress", lambda c: True),
    ]

    def garments(j: Joints, mats) -> Garments:
        g = Garments()
        sk, guides = skirt("emilia_skirt", j, SkirtSpec(top_z=j.waist.z / j.H + 0.01, length=0.2, top_rx=0.078, top_ry=0.06, flare=1.7, folds=10, fold_depth=0.14, chain_count=8, chain_bones=3), mats["dress"])
        g.objects.append(sk)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"skirt{i}"] = gl
            names.append(f"skirt{i}")
        g.bindings[sk.name] = names
        under, _ = skirt("emilia_underskirt", j, SkirtSpec(top_z=j.waist.z / j.H - 0.01, length=0.215, top_rx=0.076, top_ry=0.058, flare=1.62, folds=14, fold_depth=0.08, chain_count=8, chain_bones=3), mats["purple"])
        g.objects.append(under)
        g.bindings[under.name] = names
        collar = shoulder_collar("emilia_collar", j, mats["dress"], outer_x=0.108, outer_front=0.068, outer_back=0.092, flare=0.012, lift=0.004)
        # Purple trim peeking out under the collar's edge.
        trim = shoulder_collar("emilia_collar_trim", j, mats["purple"], outer_x=0.116, outer_front=0.075, outer_back=0.099, flare=0.01)
        trim["bone"] = "upperChest"
        g.objects.append(trim)
        collar["bone"] = "upperChest"
        g.objects.append(collar)
        return g

    def accessories(j: Joints, mats, head):
        f = HeadFrame(j, 0.84, 0.94)
        out = []
        for side, az in ((1, 62), (-1, -62)):
            p = f.surface(az, 38, 0.06)
            fl = acc.flower(f"emilia_flower{side}", p, (p - f.c).normalized(), 0.045 * j.head_h * 6.5 / 6.6, 6, mats["flower"], mats["purple"])
            out.append(fl)
        return out

    return CharacterSpec(
        id="emilia",
        body=body,
        head=HeadSpec(width=0.84, jaw=0.46, chin_point=0.35, cheek=0.2, nose=0.6, elf_ear=1.0),
        hair=hair,
        palette={
            "skin": ("#f6e1d6", "skin"),
            "face": ("#f6e1d6", "face"),
            "hair": ("#e9e7f2", "hair"),
            "dress": ("#f4f2f6", "cloth"),
            "purple": ("#8b6fc4", "cloth"),
            "boot": ("#eeeaf2", "cloth"),
            "boot_trim": ("#8b6fc4", "cloth"),
            "flower": ("#fbfaff", "cloth"),
        },
        zones=rules,
        default_zone="dress",
        face={},
        garments=garments,
        accessories=accessories,
        meta={"name": "Emilia"},
    )


# --------------------------------------------------------------------------- Beatrice

def beatrice() -> CharacterSpec:
    body = BodySpec(height=1.28, heads_tall=4.9, shoulder=0.84, hips=0.98, waist=0.9, chest=0.92, bust=0.0, limb=0.9, sleeve=1.35, sleeve_cuff=1.6, torso_cloth=1.12, trouser=1.0, shoe=1.05, leg_length=0.94)
    clumps = fringe([-52, -34, -16, 0, 16, 34, 52], 60, 0.55, width=0.38, lengths=[0.56, 0.6, 0.55, 0.62, 0.55, 0.6, 0.56]) + crown_flow(0.55, 0.42)
    for az in range(110, 255, 24):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=10, direction=(math.sin(a) * 0.4, 0.7, -0.7), length=0.8, width=0.42, thickness=0.1, stiffness=0.35, gravity=1.2, lift=0.012))
    hair = HairStyle(
        clumps=clumps,
        drills=[
            Drill(side=1, top=(0.42, 0.12, -0.02), length=2.0, radius=0.22, turns=4.5, tube=0.15, chain="hair_drillL", tip_material=1),
            Drill(side=-1, top=(-0.42, 0.12, -0.02), length=2.0, radius=0.22, turns=4.5, tube=0.15, chain="hair_drillR", tip_material=1),
        ],
        hairline_front=0.48,
        chains={"hair_drillL": 4, "hair_drillR": 4},
    )

    def stripe(c):
        # Pink and purple vertical stripes on the tights.
        a = math.atan2(c.p.y, c.p.x - math.copysign(c.j.hip_l.x, c.p.x))
        return int((a + math.pi) / (2 * math.pi) * 12) % 2 == 0

    rules = skin_rules() + [
        ("shoe", lambda c: is_foot(c, 0.01)),
        ("tights_a", lambda c: (not c.on_arm()) and c.p.z < c.j.hip_l.z - 0.03 * c.H and stripe(c)),
        ("tights_b", lambda c: (not c.on_arm()) and c.p.z < c.j.hip_l.z - 0.03 * c.H),
        ("trim", lambda c: c.on_arm() and c.arm_s() > c.arm_len() - 0.05 * c.H),
        ("trim", lambda c: (not c.on_arm()) and abs(c.p.x) < 0.02 * c.H and c.n.y < -0.4 and c.p.z > c.j.waist.z),
        ("dress", lambda c: True),
    ]

    def garments(j: Joints, mats) -> Garments:
        g = Garments()
        sk, guides = skirt("beatrice_skirt", j, SkirtSpec(top_z=j.waist.z / j.H, length=0.32, top_rx=0.085, top_ry=0.07, flare=2.1, folds=14, fold_depth=0.16, open_front=math.radians(70), chain_count=7, chain_bones=3), mats["dress"])
        g.objects.append(sk)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"skirt{i}"] = gl
            names.append(f"skirt{i}")
        g.bindings[sk.name] = names
        frill, _ = skirt("beatrice_frill", j, SkirtSpec(top_z=j.waist.z / j.H - 0.3, length=0.04, top_rx=0.085 * 2.0, top_ry=0.07 * 2.0, flare=1.15, folds=26, fold_depth=0.3, open_front=math.radians(70), chain_count=7, chain_bones=3), mats["trim"])
        g.objects.append(frill)
        g.bindings[frill.name] = names
        collar = shoulder_collar("beatrice_collar", j, mats["trim"], outer_x=0.1, outer_front=0.062, outer_back=0.085, frill_waves=14, frill_amp=0.01)
        collar["bone"] = "upperChest"
        g.objects.append(collar)
        return g

    def accessories(j: Joints, mats, head):
        f = HeadFrame(j, 0.9, 0.96)
        p = f.surface(-55, 55, 0.05)
        cr = acc.crown("beatrice_crown", p, (p - f.c).normalized(), 0.035 * j.H, mats["gold"])
        return [cr]

    return CharacterSpec(
        id="beatrice",
        body=body,
        head=HeadSpec(width=0.9, depth=0.96, jaw=0.34, chin_point=0.25, cheek=0.45, nose=0.4),
        hair=hair,
        palette={
            "skin": ("#fbe7dc", "skin"),
            "face": ("#fbe7dc", "face"),
            "hair": ("#f1e2b6", "hair"),
            "hair_tip": ("#f0a3c4", "hair"),
            "dress": ("#e98fb2", "cloth"),
            "trim": ("#fff6f8", "cloth"),
            "tights_a": ("#f3a2c3", "cloth"),
            "tights_b": ("#a57fcf", "cloth"),
            "shoe": ("#e27ba6", "cloth"),
            "gold": ("#f2cc6a", "metal"),
        },
        zones=rules,
        default_zone="dress",
        face={},
        garments=garments,
        accessories=accessories,
        meta={"name": "Beatrice"},
    )


# --------------------------------------------------------------------------- Julius

def julius() -> CharacterSpec:
    body = BodySpec(height=1.8, heads_tall=7.2, shoulder=1.12, hips=0.95, waist=0.95, chest=1.08, limb=1.02, sleeve=1.12, sleeve_cuff=1.2, torso_cloth=1.1, trouser=1.08, trouser_cuff=1.2, shoe=1.15, boot_height=0.28)
    clumps = []
    # Neat side-swept fringe with one strand hanging down the face.
    for i, az in enumerate([-40, -24, -8, 8, 24, 40]):
        clumps.append(Clump(az=az, el=62, direction=(-0.6, -0.7, -0.3), length=0.55, width=0.36, thickness=0.09, stiffness=0.55, gravity=1.0, lift=0.012))
    clumps.append(Clump(az=18, el=48, direction=(0.1, -0.9, -0.6), length=0.95, width=0.18, thickness=0.06, stiffness=0.3, gravity=1.3, curl=-0.6))
    for az in (-85, -100, 85, 100):
        clumps.append(Clump(az=az, el=30, direction=(math.copysign(0.3, az), 0.2, -1), length=0.5, width=0.36, thickness=0.09, stiffness=0.4, lift=0.012))
    for az in range(120, 250, 20):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=15, direction=(math.sin(a) * 0.4, 0.8, -0.6), length=0.55, width=0.38, thickness=0.1, stiffness=0.4, lift=0.01))
    hair = HairStyle(clumps=clumps + crown_flow(0.5, 0.4), hairline_front=0.46)
    rules = [
        ("skin", lambda c: is_skin_neck(c)),
        ("glove", lambda c: is_hand(c)),
        ("boot", lambda c: (not c.on_arm()) and c.p.z < 0.28 * c.H),
        ("gold", lambda c: c.on_arm() and c.arm_len() - 0.05 * c.H < c.arm_s() < c.arm_len() - 0.02 * c.H),
        ("gold", lambda c: (not c.on_arm()) and abs(c.p.x) < 0.012 * c.H and c.n.y < -0.5 and c.p.z > c.j.waist.z),
        ("navy", lambda c: below_waist(c, -0.04)),
        ("gold", lambda c: (not c.on_arm()) and abs(c.p.z - (c.j.waist.z - 0.02 * c.H)) < 0.012 * c.H),
        ("coat", lambda c: True),
    ]

    def garments(j: Joints, mats) -> Garments:
        g = Garments()
        tails, guides = skirt("julius_coattails", j, SkirtSpec(top_z=j.waist.z / j.H - 0.02, length=0.2, top_rx=0.082, top_ry=0.066, flare=1.25, folds=4, fold_depth=0.05, open_front=math.radians(110), chain_count=4, chain_bones=3), mats["coat"])
        g.objects.append(tails)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"coat{i}"] = gl
            names.append(f"coat{i}")
        g.bindings[tails.name] = names
        cp, cguides = cape("julius_cape", j, 0.14, 0.4, mats["navy"], chains=3, bones=3)
        g.objects.append(cp)
        cnames = []
        for i, gl in enumerate(cguides):
            g.chains[f"cape{i}"] = gl
            cnames.append(f"cape{i}")
        g.bindings[cp.name] = cnames
        cp["bone"] = "upperChest"
        collar = ring_band("julius_collar", Vector((0, j.neck_base.y, j.neck_base.z - 0.015 * j.H)), 0.04 * j.H, 0.038 * j.H, 0.03 * j.H, 0.05, mats["coat"], thickness=0.004)
        collar["bone"] = "upperChest"
        g.objects.append(collar)
        return g

    def accessories(j: Joints, mats, head):
        sw = acc.sword("julius_sword", Vector((j.hip_l.x + 0.03 * j.H, j.hip_l.y, j.hips.z)), j.H, mats["steel"], mats["gold"], mats["navy"])
        sw["bone"] = "hips"
        return [sw]

    return CharacterSpec(
        id="julius",
        body=body,
        head=HeadSpec(width=0.83, jaw=0.44, chin_point=0.4, cheek=0.1, nose=0.9),
        hair=hair,
        palette={
            "skin": ("#f4dcca", "skin"),
            "face": ("#f4dcca", "face"),
            "hair": ("#b6a0dc", "hair"),
            "coat": ("#f3f1ee", "cloth"),
            "navy": ("#2c3558", "cloth"),
            "gold": ("#d9b45a", "metal"),
            "glove": ("#f7f6f2", "cloth"),
            "boot": ("#27262b", "cloth"),
            "steel": ("#c9ced8", "metal"),
        },
        zones=rules,
        default_zone="coat",
        face={},
        garments=garments,
        accessories=accessories,
        meta={"name": "Julius Juukulius"},
    )


# --------------------------------------------------------------------------- Ram / Rem (maid uniform)

def maid(cid: str, name: str, hair_col: str, eye_side: int, clip_col: str) -> CharacterSpec:
    """Roswaal mansion maid. eye_side: which eye the fringe covers (+1 left, -1 right)."""
    body = BodySpec(height=1.54, heads_tall=6.1, **fem_body(bust=0.45 if cid == "rem" else 0.3), sleeve=1.08, sleeve_cuff=1.1, torso_cloth=1.04, shoe=1.0)
    clumps = []
    # Bob: everything falls to the jaw, fringe heavier over one eye.
    for i, az in enumerate([-50, -32, -14, 0, 14, 32, 50]):
        covered = (az * eye_side) > 5
        clumps.append(Clump(az=az, el=58, direction=(math.sin(math.radians(az)) * 0.25 + (0.25 * eye_side if covered else -0.2 * eye_side), -0.85, -0.55), length=0.8 if covered else 0.58, width=0.34 if not covered else 0.3, thickness=0.09, stiffness=0.35, gravity=1.2, lift=0.01))
    for az in range(70, 291, 18):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=20, direction=(math.sin(a) * 0.45, -math.cos(a) * 0.45 + 0.2, -0.9), length=0.95, width=0.4, thickness=0.1, stiffness=0.3, gravity=1.2, lift=0.014, curl=0.5 * (1 if math.sin(a) > 0 else -1)))
    hair = HairStyle(clumps=clumps + crown_flow(0.55, 0.42), hairline_front=0.46)
    rules = skin_rules(lambda c: (not c.on_arm()) and c.j.knee_l.z + 0.1 * c.H < c.p.z < c.j.hip_l.z - 0.06 * c.H) + [
        ("shoe", lambda c: is_foot(c, 0.008)),
        ("sock", lambda c: (not c.on_arm()) and c.p.z <= c.j.knee_l.z + 0.1 * c.H),
        ("white", lambda c: c.on_arm() and c.arm_s() > c.arm_len() - 0.035 * c.H),
        ("black", lambda c: True),
    ]

    def garments(j: Joints, mats) -> Garments:
        g = Garments()
        sk, guides = skirt(f"{cid}_skirt", j, SkirtSpec(top_z=j.waist.z / j.H + 0.01, length=0.22, top_rx=0.078, top_ry=0.062, flare=1.9, folds=12, fold_depth=0.14, chain_count=8, chain_bones=3), mats["black"])
        g.objects.append(sk)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"skirt{i}"] = gl
            names.append(f"skirt{i}")
        g.bindings[sk.name] = names
        frill, _ = skirt(f"{cid}_petticoat", j, SkirtSpec(top_z=j.waist.z / j.H - 0.19, length=0.04, top_rx=0.078 * 1.85, top_ry=0.062 * 1.85, flare=1.1, folds=24, fold_depth=0.25, chain_count=8, chain_bones=3), mats["white"])
        g.objects.append(frill)
        g.bindings[frill.name] = names
        ap, aguides = apron(f"{cid}_apron", j, j.waist.z / j.H + 0.005, 0.19, 0.12, mats["white"])
        g.objects.append(ap)
        g.chains["apron0"] = aguides[0]
        g.bindings[ap.name] = ["apron0"]
        collar = shoulder_collar(f"{cid}_collar", j, mats["white"], outer_x=0.1, outer_front=0.062, outer_back=0.07, frill_waves=18, frill_amp=0.008)
        collar["bone"] = "upperChest"
        g.objects.append(collar)
        return g

    def accessories(j: Joints, mats, head):
        f = HeadFrame(j, 0.84, 0.94)
        hd = acc.headdress(f"{cid}_headdress", f.c, f.rw, f.rh, mats["white"])
        p = f.surface(-40 * eye_side, 45, 0.05)
        clip = acc.x_clip(f"{cid}_clip", p, (p - f.c).normalized(), 0.05 * j.head_h * 6, mats["clip"])
        return [hd, clip]

    return CharacterSpec(
        id=cid,
        body=body,
        head=HeadSpec(width=0.85, jaw=0.42, chin_point=0.3, cheek=0.25, nose=0.5),
        hair=hair,
        palette={
            "skin": ("#f8e4d8", "skin"),
            "face": ("#f8e4d8", "face"),
            "hair": (hair_col, "hair"),
            "black": ("#1f1c26", "cloth"),
            "white": ("#fbfaf8", "cloth"),
            "sock": ("#f6f5f2", "cloth"),
            "shoe": ("#1a1a1f", "cloth"),
            "clip": (clip_col, "metal"),
        },
        zones=rules,
        default_zone="black",
        face={},
        garments=garments,
        accessories=accessories,
        meta={"name": name},
    )


def ram() -> CharacterSpec:
    return maid("ram", "Ram", "#f2a7bb", 1, "#9b6ad0")


def rem() -> CharacterSpec:
    return maid("rem", "Rem", "#7da3e0", -1, "#f5f5fa")


# --------------------------------------------------------------------------- Meili

def meili() -> CharacterSpec:
    body = BodySpec(height=1.45, heads_tall=5.6, **fem_body(bust=0.1, hips=1.0, limb=0.86), sleeve=1.1, sleeve_cuff=1.2, torso_cloth=1.05, shoe=1.05, leg_length=0.97)
    clumps = fringe([-48, -30, -11, 11, 30, 48], 58, 0.54, width=0.38) + side_locks(1.1, chain=False) + crown_flow(0.6, 0.42)
    for az in range(110, 251, 22):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=15, direction=(math.sin(a) * 0.2, 0.9, -0.5), length=0.6, width=0.38, thickness=0.1, stiffness=0.4, lift=0.01))
    hair = HairStyle(clumps=clumps, hairline_front=0.46)
    rules = skin_rules() + [
        ("boot", lambda c: (not c.on_arm()) and c.p.z < c.j.knee_l.z),
        ("tights", lambda c: (not c.on_arm()) and c.p.z < c.j.hip_l.z - 0.04 * c.H),
        ("trim", lambda c: c.on_arm() and c.arm_s() > c.arm_len() - 0.04 * c.H),
        ("dress", lambda c: True),
    ]

    def garments(j: Joints, mats) -> Garments:
        g = Garments()
        sk, guides = skirt("meili_skirt", j, SkirtSpec(top_z=j.waist.z / j.H + 0.01, length=0.24, top_rx=0.08, top_ry=0.064, flare=1.6, folds=8, fold_depth=0.1, chain_count=6, chain_bones=3), mats["dress"])
        g.objects.append(sk)
        names = [f"skirt{i}" for i in range(len(guides))]
        for n_, gl in zip(names, guides):
            g.chains[n_] = gl
        g.bindings[sk.name] = names
        cp = shoulder_collar("meili_capelet", j, mats["trim"], outer_x=0.126, outer_front=0.074, outer_back=0.1, flare=0.02)
        cp["bone"] = "upperChest"
        g.objects.append(cp)
        return g

    def accessories(j: Joints, mats, head):
        f = HeadFrame(j, 0.86, 0.95)
        pts = [f.c + Vector((0, f.rd * 0.9, -f.rh * 0.1)) + Vector((0, 0.04 * t * j.H, -0.075 * t * j.H)) for t in range(7)]
        br = acc.braid("meili_braid", pts, 0.05 * j.H, mats["hair"])
        p = f.surface(62, 40, 0.06)
        fl = acc.flower("meili_flower", p, (p - f.c).normalized(), 0.05 * j.head_h * 5.6 / 5.6, 5, mats["flower"], mats["trim"])
        return [br, fl]

    return CharacterSpec(
        id="meili",
        body=body,
        head=HeadSpec(width=0.87, jaw=0.4, chin_point=0.28, cheek=0.35, nose=0.45),
        hair=hair,
        palette={
            "skin": ("#f7e3d6", "skin"),
            "face": ("#f7e3d6", "face"),
            "hair": ("#2b3a78", "hair"),
            "dress": ("#2a2436", "cloth"),
            "trim": ("#e8e2ee", "cloth"),
            "tights": ("#1d1a24", "cloth"),
            "boot": ("#3a2a26", "cloth"),
            "flower": ("#f28db4", "cloth"),
        },
        zones=rules,
        default_zone="dress",
        face={},
        garments=garments,
        accessories=accessories,
        meta={"name": "Meili Portroute"},
    )


# --------------------------------------------------------------------------- Anastasia (Echidna)

def anastasia() -> CharacterSpec:
    body = BodySpec(height=1.55, heads_tall=6.1, **fem_body(bust=0.3), sleeve=1.3, sleeve_cuff=1.7, torso_cloth=1.06, shoe=1.0)
    clumps = fringe([-48, -30, -11, 11, 30, 48], 58, 0.55, width=0.38) + side_locks(1.5, curl=1.2) + long_back(2.0, curl=0.9, step=20, chains=4) + crown_flow(0.55, 0.42)
    hair = HairStyle(clumps=clumps, hairline_front=0.46, chains={"hair_back0": 4, "hair_back1": 4, "hair_back2": 4, "hair_back3": 4, "hair_sideL": 4, "hair_sideR": 4})
    rules = skin_rules() + [
        ("shoe", lambda c: is_foot(c, 0.008)),
        ("trim", lambda c: c.on_arm() and c.arm_s() > c.arm_len() - 0.05 * c.H),
        ("gown", lambda c: True),
    ]

    def garments(j: Joints, mats) -> Garments:
        g = Garments()
        sk, guides = skirt("ana_gown", j, SkirtSpec(top_z=j.waist.z / j.H + 0.01, length=0.5, top_rx=0.08, top_ry=0.066, flare=1.9, folds=10, fold_depth=0.12, chain_count=8, chain_bones=4), mats["gown"])
        g.objects.append(sk)
        names = [f"skirt{i}" for i in range(len(guides))]
        for n_, gl in zip(names, guides):
            g.chains[n_] = gl
        g.bindings[sk.name] = names
        return g

    def accessories(j: Joints, mats, head):
        fx = acc.fox_scarf("ana_echidna", j, mats["fur"], mats["dark"])
        fx["bone"] = "upperChest"
        return [fx]

    return CharacterSpec(
        id="anastasia",
        body=body,
        head=HeadSpec(width=0.85, jaw=0.42, chin_point=0.3, cheek=0.25, nose=0.5),
        hair=hair,
        palette={
            "skin": ("#f8e6da", "skin"),
            "face": ("#f8e6da", "face"),
            "hair": ("#c9b6e6", "hair"),
            "gown": ("#f5f3f0", "cloth"),
            "trim": ("#d6c7ea", "cloth"),
            "shoe": ("#e8e0f0", "cloth"),
            "fur": ("#ffffff", "cloth"),
            "dark": ("#111114", "cloth"),
        },
        zones=rules,
        default_zone="gown",
        face={},
        garments=garments,
        accessories=accessories,
        meta={"name": "Anastasia Hoshin"},
    )


# --------------------------------------------------------------------------- Shaula

def shaula() -> CharacterSpec:
    body = BodySpec(height=1.72, heads_tall=6.9, **fem_body(bust=0.75, hips=1.1, limb=0.9), sleeve=1.0, torso_cloth=1.0, trouser=1.02, shoe=1.1, boot_height=0.27)
    clumps = fringe([-52, -34, -16, 0, 16, 34, 52], 58, 0.58, width=0.38) + side_locks(1.3, chain=False) + crown_flow(0.6, 0.42)
    # High ponytail: springs up from the crown, arcs back and falls down
    # the back like a scorpion's tail.
    for k in range(9):
        a = math.radians(160 + k * 5)
        clumps.append(Clump(az=180 + (k - 4) * 6, el=62 + (k % 3) * 3, direction=(math.sin(a) * 0.2, 0.75, 0.6), length=3.6, width=0.42, thickness=0.12, stiffness=0.35, gravity=1.4, curl=0.0, lift=0.02, chain="hair_tail", hold=0.6))
    hair = HairStyle(clumps=clumps, hairline_front=0.46, chains={"hair_tail": 6})

    def top(c):
        return c.j.chest.z - 0.03 * c.H < c.p.z < c.j.upper_chest.z + 0.005 * c.H and abs(c.p.x) < 0.1 * c.H and not c.on_arm()

    rules = [
        ("skin", lambda c: is_skin_neck(c) or is_hand(c)),
        ("black", lambda c: top(c)),
        ("orange", lambda c: (not c.on_arm()) and abs(c.p.z - (c.j.waist.z - 0.035 * c.H)) < 0.012 * c.H),
        ("black", lambda c: (not c.on_arm()) and c.j.hip_l.z - 0.07 * c.H < c.p.z < c.j.waist.z - 0.035 * c.H),
        ("orange", lambda c: (not c.on_arm()) and 0.26 * c.H < c.p.z < 0.28 * c.H),
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= 0.27 * c.H),
        ("skin", lambda c: True),
    ]

    def garments(j: Joints, mats) -> Garments:
        g = Garments()
        cp, cguides = cape("shaula_cloak", j, 0.135, 0.5, mats["cloak"], tatters=1.0, chains=4, bones=4, folds=6, fold_depth=0.016)
        cp["bone"] = "upperChest"
        g.objects.append(cp)
        names = []
        for i, gl in enumerate(cguides):
            g.chains[f"cape{i}"] = gl
            names.append(f"cape{i}")
        g.bindings[cp.name] = names
        return g

    return CharacterSpec(
        id="shaula",
        body=body,
        head=HeadSpec(width=0.84, jaw=0.44, chin_point=0.35, cheek=0.2, nose=0.6),
        hair=hair,
        palette={
            "skin": ("#f1d4bf", "skin"),
            "face": ("#f1d4bf", "face"),
            "hair": ("#3a2a24", "hair"),
            "black": ("#18161a", "cloth"),
            "orange": ("#e67a2e", "cloth"),
            "boot": ("#1d1a1d", "cloth"),
            "cloak": ("#221e24", "cloth"),
        },
        zones=rules,
        default_zone="skin",
        face={},
        garments=garments,
        meta={"name": "Shaula"},
    )


# --------------------------------------------------------------------------- Reid Astrea

def reid() -> CharacterSpec:
    """The first Sword Saint's shade, keeper of Electra's trial. Astrea red
    hair worn wild, a traveller's rough clothes — a sleeveless dark tunic,
    a sash, bandaged forearms, a tattered half-cloak — and a sword he
    never draws (he fights with a pair of chopsticks)."""
    body = BodySpec(height=1.86, heads_tall=7.4, shoulder=1.2, hips=0.98, waist=1.0, chest=1.14, limb=1.06, sleeve=1.0, sleeve_cuff=1.0, torso_cloth=1.08, trouser=1.14, trouser_cuff=1.22, shoe=1.18, boot_height=0.24)
    clumps = []
    # A wild, flame-shaped fringe pushed up and back off the forehead.
    for i, az in enumerate([-46, -28, -10, 10, 28, 46]):
        side = math.sin(math.radians(az))
        clumps.append(Clump(az=az, el=62, direction=(side * 0.5, -0.35, 0.55), length=0.62 + 0.1 * (i % 2), width=0.36, thickness=0.1, stiffness=0.85, gravity=0.3, curl=0.4 * (1 if az < 0 else -1), lift=0.02, tip=2.0))
    # Two loose strands falling over the face.
    clumps.append(Clump(az=-14, el=52, direction=(-0.2, -0.9, -0.5), length=0.7, width=0.16, thickness=0.06, stiffness=0.4, gravity=1.2, curl=0.5))
    clumps.append(Clump(az=22, el=50, direction=(0.25, -0.9, -0.5), length=0.62, width=0.14, thickness=0.06, stiffness=0.4, gravity=1.2, curl=-0.5))
    # Spiky sides and a shaggy back that stops at the nape.
    for az in (-80, -98, 80, 98):
        clumps.append(Clump(az=az, el=32, direction=(math.copysign(0.55, az), 0.2, -0.8), length=0.5, width=0.34, thickness=0.1, stiffness=0.6, lift=0.02, tip=1.8))
    for az in range(115, 250, 18):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=18, direction=(math.sin(a) * 0.6, 0.85, -0.3), length=0.62, width=0.38, thickness=0.11, stiffness=0.55, gravity=0.9, lift=0.015, tip=1.8, chain="hair_back0" if az < 185 else "hair_back1"))
    hair = HairStyle(clumps=clumps + crown_flow(0.55, 0.42, step=24), hairline_front=0.44, chains={"hair_back0": 3, "hair_back1": 3})

    def wraps(c):
        return c.on_arm() and c.arm_len() - 0.13 * c.H < c.arm_s() < c.arm_len() - 0.012 * c.H

    rules = [
        ("skin", lambda c: is_skin_neck(c) or is_hand(c)),
        ("wrap", wraps),
        ("skin", lambda c: c.on_arm() and c.arm_s() > 0.045 * c.H),
        ("boot", lambda c: (not c.on_arm()) and c.p.z < 0.24 * c.H),
        ("sash", lambda c: (not c.on_arm()) and abs(c.p.z - (c.j.waist.z - 0.01 * c.H)) < 0.024 * c.H),
        ("trousers", lambda c: below_waist(c, -0.03)),
        ("tunic", lambda c: True),
    ]

    def garments(j: Joints, mats) -> Garments:
        g = Garments()
        # A tattered half-cloak thrown over the shoulders.
        cp, cguides = cape("reid_cloak", j, 0.13, 0.36, mats["cloak"], tatters=1.0, chains=3, bones=3, folds=5, fold_depth=0.014)
        cp["bone"] = "upperChest"
        g.objects.append(cp)
        names = []
        for i, gl in enumerate(cguides):
            g.chains[f"cape{i}"] = gl
            names.append(f"cape{i}")
        g.bindings[cp.name] = names
        return g

    def accessories(j: Joints, mats, head):
        sw = acc.sword("reid_sword", Vector((j.hip_l.x + 0.035 * j.H, j.hip_l.y, j.hips.z)), j.H, mats["steel"], mats["sash"], mats["boot"])
        sw["bone"] = "hips"
        return [sw]

    return CharacterSpec(
        id="reid",
        body=body,
        head=HeadSpec(width=0.84, jaw=0.5, chin_point=0.46, cheek=0.06, nose=1.0),
        hair=hair,
        palette={
            "skin": ("#e7c1a0", "skin"),
            "face": ("#e7c1a0", "face"),
            "hair": ("#c3262a", "hair"),
            "tunic": ("#2b2728", "cloth"),
            "sash": ("#b58a3c", "cloth"),
            "trousers": ("#4b3f35", "cloth"),
            "wrap": ("#d9cfbc", "cloth"),
            "boot": ("#2a2220", "cloth"),
            "cloak": ("#5b1d1b", "cloth"),
            "steel": ("#c9ced8", "metal"),
        },
        zones=rules,
        default_zone="tunic",
        face={},
        garments=garments,
        accessories=accessories,
        meta={"name": "Reid Astrea"},
    )


ROSTER = {
    "subaru": subaru,
    "emilia": emilia,
    "beatrice": beatrice,
    "julius": julius,
    "ram": ram,
    "rem": rem,
    "meili": meili,
    "anastasia": anastasia,
    "shaula": shaula,
    "reid": reid,
}

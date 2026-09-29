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
from hair import Clump, Drill, HairStyle
from head import HeadSpec
from humanoid import BodySpec, Joints
from outfit import Garments, ZoneContext, ring_band

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
        ("grey", lambda c: c.p.z > c.j.upper_chest.z - 0.005 * c.H and abs(c.p.x) > 0.045 * c.H),  # shoulders
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
    )


ROSTER = {
    "subaru": subaru,
}

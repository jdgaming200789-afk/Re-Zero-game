"""Anime humanoid generator: armature, skin-modifier body, sculpted head, hands, feet.

Coordinates: Blender Z-up, the character faces -Y (three.js +Z after export).
All proportions are fractions of total height H so one routine serves every
character (Beatrice at ~4.8 heads tall through Julius at ~7.4).

Bone names follow the VRM humanoid convention the engine expects:
  root, hips, spine, chest, upperChest, neck, head,
  shoulder.L/R, upperArm.L/R, lowerArm.L/R, hand.L/R,
  upperLeg.L/R, lowerLeg.L/R, foot.L/R, toes.L/R
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import bpy  # noqa: F401  (must precede bmesh/mathutils)
import bmesh
from mathutils import Vector


@dataclass
class BodySpec:
    height: float = 1.72
    heads_tall: float = 7.0
    shoulder: float = 1.0  # width multipliers
    hips: float = 1.0
    waist: float = 1.0
    chest: float = 1.0
    bust: float = 0.0  # 0 flat .. 1
    limb: float = 1.0  # limb thickness
    leg_length: float = 1.0  # multiplies leg share of height
    # Clothing silhouette multipliers (loose clothes = larger radii)
    sleeve: float = 1.0
    sleeve_cuff: float = 1.0
    trouser: float = 1.0
    trouser_cuff: float = 1.0
    torso_cloth: float = 1.0
    shoe: float = 1.0
    boot_height: float = 0.0  # fraction of H covered by boots
    extra: dict = field(default_factory=dict)


class Joints:
    """Named joint positions in metres for a BodySpec (A-pose, arms ~40° down)."""

    def __init__(self, s: BodySpec):
        H = s.height
        head_h = H / s.heads_tall
        self.H = H
        self.head_h = head_h
        top = H
        chin = top - head_h
        self.head_top = Vector((0, 0, top))
        self.chin = Vector((0, -0.01 * H, chin + 0.005 * H))
        self.head_center = Vector((0, 0.005 * H, chin + head_h * 0.52))
        neck_top = chin + head_h * 0.22
        neck_base = chin - head_h * 0.1
        self.neck_top = Vector((0, 0.008 * H, neck_top))
        self.neck_base = Vector((0, 0.012 * H, neck_base))
        # Torso: remaining space down to the crotch.
        leg_share = 0.47 * s.leg_length * (0.93 + 0.07 * (s.heads_tall / 7.0))
        crotch = H * leg_share
        torso = neck_base - crotch
        self.upper_chest = Vector((0, 0.008 * H, neck_base - torso * 0.14))
        self.chest = Vector((0, 0.004 * H, neck_base - torso * 0.33))
        self.waist = Vector((0, 0.0, neck_base - torso * 0.6))
        self.hips = Vector((0, 0.0, crotch + torso * 0.14))
        self.pelvis = Vector((0, 0.002 * H, crotch + torso * 0.05))
        hip_x = 0.052 * H * s.hips
        self.hip_l = Vector((hip_x, 0.0, crotch + torso * 0.02))
        self.knee_l = Vector((hip_x * 0.92, -0.008 * H, crotch * 0.52))
        self.ankle_l = Vector((hip_x * 0.95, 0.004 * H, H * 0.045))
        self.toe_l = Vector((hip_x * 1.0, -0.075 * H, H * 0.016))
        self.heel_l = Vector((hip_x * 0.95, 0.018 * H, H * 0.012))
        sh_x = 0.118 * H * s.shoulder
        self.shoulder_l = Vector((0.03 * H, 0.006 * H, self.upper_chest.z + torso * 0.03))
        self.arm_l = Vector((sh_x, 0.01 * H, self.upper_chest.z - torso * 0.02))
        upper_arm = 0.185 * H
        fore_arm = 0.155 * H
        ang = math.radians(42)  # below horizontal
        d = Vector((math.cos(ang), 0.0, -math.sin(ang)))
        self.elbow_l = self.arm_l + d * upper_arm + Vector((0, 0.008 * H, 0))
        self.wrist_l = self.elbow_l + d * fore_arm + Vector((0, -0.004 * H, 0))
        self.hand_end_l = self.wrist_l + d * (0.1 * H)
        self.thumb_l = self.wrist_l + Vector((0.012 * H, -0.03 * H, -0.02 * H))

    @staticmethod
    def mirror(v: Vector) -> Vector:
        return Vector((-v.x, v.y, v.z))


# --------------------------------------------------------------------------- armature

BONES = [
    # name, head, tail, parent
    ("hips", "pelvis", "waist", "root"),
    ("spine", "waist", "chest", "hips"),
    ("chest", "chest", "upper_chest", "spine"),
    ("upperChest", "upper_chest", "neck_base", "chest"),
    ("neck", "neck_base", "neck_top", "upperChest"),
    ("head", "neck_top", "head_top", "neck"),
]
LIMBS = [
    ("shoulder", "shoulder", "arm", "upperChest"),
    ("upperArm", "arm", "elbow", "shoulder"),
    ("lowerArm", "elbow", "wrist", "upperArm"),
    ("hand", "wrist", "hand_end", "lowerArm"),
    ("upperLeg", "hip", "knee", "hips"),
    ("lowerLeg", "knee", "ankle", "upperLeg"),
    ("foot", "ankle", "toe_base", "lowerLeg"),
    ("toes", "toe_base", "toe", "foot"),
]


def joint(j: Joints, key: str, side: str | None) -> Vector:
    if key == "toe_base":
        base = j.ankle_l.lerp(j.toe_l, 0.62)
        base.z = j.H * 0.018
        v = base
    else:
        v = getattr(j, f"{key}_l" if side else key, None)
        if v is None:
            v = getattr(j, key)
    if side == "R":
        v = Joints.mirror(v)
    return v.copy()


def build_armature(name: str, j: Joints) -> bpy.types.Object:
    arm_data = bpy.data.armatures.new(name + "_rig")
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    root = eb.new("root")
    root.head = (0, 0, 0)
    root.tail = (0, 0.1 * j.H, 0)
    for n, h, t, p in BONES:
        b = eb.new(n)
        b.head = joint(j, h, None)
        b.tail = joint(j, t, None)
        b.parent = eb[p]
        b.use_connect = False
    for side in ("L", "R"):
        for n, h, t, p in LIMBS:
            b = eb.new(f"{n}.{side}")
            b.head = joint(j, h, side)
            b.tail = joint(j, t, side)
            parent = p if p in ("upperChest", "hips") else f"{p}.{side}"
            b.parent = eb[parent]
            b.use_connect = False
            # Knees/elbows: roll so the local X axis is the hinge (consistent both sides)
            b.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def add_chain(arm: bpy.types.Object, names_points: list[tuple[str, Vector, Vector]], parent: str) -> None:
    """Add a bone chain (hair / cloth) to an existing armature."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    prev = eb[parent]
    for name, h, t in names_points:
        b = eb.new(name)
        b.head = h
        b.tail = t
        b.parent = prev
        b.use_connect = False
        prev = b
    bpy.ops.object.mode_set(mode="OBJECT")


# --------------------------------------------------------------------------- body


def build_body(name: str, s: BodySpec, j: Joints) -> bpy.types.Object:
    """Smooth body via Skin + Subdivision modifiers over a joint graph."""
    H = j.H
    L = s.limb
    bm = bmesh.new()
    verts: dict[str, bmesh.types.BMVert] = {}
    radii: dict[str, tuple[float, float]] = {}

    def v(key: str, pos: Vector, rx: float, ry: float):
        verts[key] = bm.verts.new(pos)
        radii[key] = (rx * H, ry * H)

    tc = s.torso_cloth
    # Spine column (x = lateral radius, y = depth radius)
    v("pelvis", j.pelvis, 0.088 * s.hips * tc, 0.062 * tc)
    v("hips", j.hips, 0.082 * s.hips * tc, 0.058 * tc)
    v("waist", j.waist, 0.072 * s.waist * tc, 0.052 * tc)
    v("chest", j.chest, 0.086 * s.chest * tc, 0.06 * tc)
    v("upper_chest", j.upper_chest, 0.094 * s.shoulder * tc, 0.056 * tc)
    v("neck_base", j.neck_base, 0.037, 0.036)
    v("neck_top", j.neck_top, 0.03, 0.031)
    for side, sign in (("l", 1), ("r", -1)):
        m = (lambda p: p) if sign > 0 else Joints.mirror
        # Legs (thigh thickness blends into hips)
        tr = s.trouser
        v(f"hip_{side}", m(j.hip_l), 0.06 * L * tr, 0.062 * L * tr)
        mid_thigh = m(j.hip_l.lerp(j.knee_l, 0.5))
        v(f"thigh_{side}", mid_thigh, 0.051 * L * tr, 0.053 * L * tr)
        v(f"knee_{side}", m(j.knee_l), 0.036 * L * tr, 0.038 * L * tr)
        calf = m(j.knee_l.lerp(j.ankle_l, 0.35))
        calf.y += 0.006 * H
        v(f"calf_{side}", calf, 0.039 * L * tr, 0.042 * L * tr)
        boot = s.boot_height > 0
        ank_r = 0.024 * L * max(s.trouser_cuff, 1.25 if boot else 1.0)
        v(f"ankle_{side}", m(j.ankle_l), ank_r, ank_r * 1.05)
        # Foot: ankle → toe, flattened
        sh = s.shoe
        v(f"toe_{side}", m(j.toe_l), 0.025 * sh, 0.016 * sh)
        v(f"heel_{side}", m(j.heel_l), 0.022 * sh, 0.016 * sh)
        # Arms
        sl = s.sleeve
        v(f"shoulder_{side}", m(j.shoulder_l), 0.042 * L * sl, 0.036 * L * sl)
        v(f"arm_{side}", m(j.arm_l), 0.037 * L * sl, 0.036 * L * sl)
        v(f"elbow_{side}", m(j.elbow_l), 0.028 * L * sl, 0.028 * L * sl)
        fore = m(j.elbow_l.lerp(j.wrist_l, 0.4))
        v(f"fore_{side}", fore, 0.028 * L * sl, 0.026 * L * sl)
        cuff = s.sleeve_cuff
        v(f"wrist_{side}", m(j.wrist_l), 0.02 * L * cuff, 0.017 * L * cuff)
        hand_mid = m(j.wrist_l.lerp(j.hand_end_l, 0.45))
        v(f"palm_{side}", hand_mid, 0.027 * L, 0.013 * L)
        v(f"hand_end_{side}", m(j.hand_end_l), 0.019 * L, 0.009 * L)
        v(f"thumb_{side}", m(j.thumb_l), 0.009 * L, 0.009 * L)

    def e(a, b):
        bm.edges.new((verts[a], verts[b]))

    e("pelvis", "hips")
    e("hips", "waist")
    e("waist", "chest")
    e("chest", "upper_chest")
    e("upper_chest", "neck_base")
    e("neck_base", "neck_top")
    for side in ("l", "r"):
        e("pelvis", f"hip_{side}")
        e(f"hip_{side}", f"thigh_{side}")
        e(f"thigh_{side}", f"knee_{side}")
        e(f"knee_{side}", f"calf_{side}")
        e(f"calf_{side}", f"ankle_{side}")
        e(f"ankle_{side}", f"heel_{side}")
        e(f"ankle_{side}", f"toe_{side}")
        e("upper_chest", f"shoulder_{side}")
        e(f"shoulder_{side}", f"arm_{side}")
        e(f"arm_{side}", f"elbow_{side}")
        e(f"elbow_{side}", f"fore_{side}")
        e(f"fore_{side}", f"wrist_{side}")
        e(f"wrist_{side}", f"palm_{side}")
        e(f"palm_{side}", f"hand_end_{side}")
        e(f"wrist_{side}", f"thumb_{side}")

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    order = list(verts.keys())
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    skin = obj.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.6
    skin.use_x_symmetry = True
    for i, key in enumerate(order):
        sv = me.skin_vertices[0].data[i]
        sv.radius = radii[key]
        sv.use_root = key == "pelvis"
    sub = obj.modifiers.new("Sub", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=skin.name)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    shape_body(obj, s, j)
    return obj


def shape_body(obj, s: BodySpec, j: Joints) -> None:
    """Post-skin sculpting: chest plane, bust, buttocks, shoulder blades, flat soles."""
    H = j.H
    me = obj.data
    for vert in me.vertices:
        p = vert.co
        # Flatten the front of the torso a little (less tube-like).
        if j.waist.z < p.z < j.neck_base.z and abs(p.x) < 0.11 * H and p.y < 0:
            p.y *= 0.92
        # Bust
        if s.bust > 0 and p.y < 0:
            c = Vector((0.04 * H * math.copysign(1, p.x if p.x != 0 else 1), -0.045 * H, j.chest.z + 0.012 * H))
            d = (p - c).length / (0.05 * H)
            if d < 1:
                p.y -= s.bust * 0.018 * H * (1 - d * d) ** 2
        # Buttocks
        if j.hip_l.z - 0.06 * H < p.z < j.hips.z and p.y > 0 and abs(p.x) < 0.09 * H:
            k = 1 - abs((p.z - (j.hip_l.z - 0.005 * H)) / (0.06 * H))
            p.y += max(0.0, k) * 0.008 * H
        # Flat soles
        if p.z < 0.004 * H:
            p.z = 0.0
        vert.co = p

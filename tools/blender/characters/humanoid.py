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
from mathutils import Matrix, Vector


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
        # Stub only: the modelled hand (build_hand) is joined over it.
        hand_mid = m(j.wrist_l.lerp(j.hand_end_l, 0.3))
        v(f"palm_{side}", hand_mid, 0.012 * L, 0.01 * L)

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
    if s.extra.get("torso_detail"):
        refine_torso(obj, j, int(s.extra["torso_detail"]))
    if s.extra.get("chest_detail"):
        refine_chest(obj, j, int(s.extra["chest_detail"]))
    ts = s.extra.get("torso_sculpt")
    if ts and ts.get("navel"):
        # Fine enough round the navel for it to read as a small dimple.
        nav = Vector((0.0, -0.1 * j.H, j.waist.z + ts.get("navel_dz", -0.012) * j.H))
        refine_spot(obj, nav, 0.026 * j.H, 2)
        refine_spot(obj, nav, 0.012 * j.H, 2)
    shape_body(obj, s, j)
    if s.extra.get("muscle"):
        sculpt_muscles(obj, s, j, float(s.extra["muscle"]))
    return obj


def refine_chest(obj, j: Joints, cuts: int) -> None:
    """More rows over the front of the chest (on the smooth surface), so a
    shaped bust keeps its rounded lower pole and under-bust fold instead of
    being flattened into the coarse rows between the torso's joints."""
    H = j.H
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)

    def region(p: Vector) -> bool:
        return j.chest.z - 0.07 * H < p.z < j.chest.z + 0.085 * H and p.y < 0.02 * H and abs(p.x) < 0.12 * H

    edges = [e for e in bm.edges if region(e.verts[0].co) and region(e.verts[1].co)]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True, smooth=1.0)
    bm.to_mesh(me)
    bm.free()


def refine_spot(obj, centre: Vector, radius: float, cuts: int) -> None:
    """More rows in a small patch of the front of the body round `centre`
    (its y only says which side: front if negative)."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)

    def region(p: Vector) -> bool:
        return p.y * centre.y > 0 and math.hypot(p.x - centre.x, p.z - centre.z) < radius

    edges = [e for e in bm.edges if region(e.verts[0].co) and region(e.verts[1].co)]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True, smooth=1.0)
    bm.to_mesh(me)
    bm.free()


def refine_torso(obj, j: Joints, cuts: int) -> None:
    """More rows over the whole torso, from the tops of the thighs to the
    neck, all the way round (on the smooth surface), so the chest, waist,
    belly and hips are shaped at one density and read as one body. The
    arms (beside the torso above the armpit) are left as they are."""
    H = j.H
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    z0, z1 = j.hip_l.z - 0.06 * H, j.neck_base.z

    def region(p: Vector) -> bool:
        return z0 < p.z < z1 and (p.z < j.chest.z - 0.01 * H or abs(p.x) < 0.12 * H)

    edges = [e for e in bm.edges if region(e.verts[0].co) and region(e.verts[1].co)]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True, smooth=1.0)
    bm.to_mesh(me)
    bm.free()


def sculpt_muscles(obj, s: BodySpec, j: Joints, amount: float) -> None:
    """Anatomy for a bare, muscular torso and arms (Reid): the torso and
    shoulders are refined once, then pecs with a hard lower shelf, a
    sternum groove, six abdominal blocks over the linea alba, obliques,
    collarbones, trapezius, deltoids, biceps and triceps, shoulder blades
    and the spinal groove are pushed into the surface."""
    H = j.H
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)

    def region(p: Vector) -> bool:
        return j.hip_l.z - 0.02 * H < p.z < j.neck_top.z and (abs(p.x) < 0.17 * H or p.z > j.elbow_l.z)

    edges = [e for e in bm.edges if region(e.verts[0].co) and region(e.verts[1].co)]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True, smooth=1.0)
    bm.normal_update()

    def bump(p, c, rx, ry, rz):
        d = ((p.x - c.x) / rx) ** 2 + ((p.y - c.y) / ry) ** 2 + ((p.z - c.z) / rz) ** 2
        return max(0.0, 1.0 - d) ** 2

    side_arm = []
    for side in (1, -1):
        a = Vector((j.arm_l.x * side, j.arm_l.y, j.arm_l.z))
        e = Vector((j.elbow_l.x * side, j.elbow_l.y, j.elbow_l.z))
        side_arm.append((side, a, e))
    shade_vals = {}
    for v in bm.verts:
        p = v.co
        n = v.normal
        d = 0.0
        dark = 0.0
        front = p.y < 0
        sx = 1 if p.x >= 0 else -1
        on_torso = abs(p.x) < 0.13 * H
        if on_torso and front:
            # Pectorals: a broad dome with a crisp lower edge.
            c = Vector((sx * 0.052 * H, -0.06 * H, j.chest.z + 0.012 * H))
            u = (p.x - c.x) / (0.062 * H)
            w = (p.z - c.z) / (0.045 * H)
            if u * u + w * w < 1.0:
                shelf = 1.0 if w > -0.45 else max(0.0, 1.0 - (-0.45 - w) / 0.3)
                d += 0.016 * H * (1 - u * u - w * w) ** 0.6 * shelf
                # The shadow under the pec's lower edge.
                if -1.0 < w < -0.55 and abs(u) < 0.95:
                    dark = max(dark, (1 - abs(w + 0.78) / 0.23) * (1 - abs(u) ** 3))
            # Sternum groove.
            if abs(p.x) < 0.012 * H and j.chest.z - 0.04 * H < p.z < j.upper_chest.z:
                d -= 0.004 * H * (1 - abs(p.x) / (0.012 * H))
                dark = max(dark, 0.5 * (1 - abs(p.x) / (0.012 * H)))
            # Abdominals: three rows of paired blocks, the lowest the longest.
            for row, (z0, z1) in enumerate(((j.chest.z - 0.058 * H, j.chest.z - 0.03 * H), (j.waist.z + 0.006 * H, j.chest.z - 0.064 * H), (j.waist.z - 0.04 * H, j.waist.z))):
                cz = (z0 + z1) / 2
                hz = (z1 - z0) / 2 + 0.001 * H
                cxa = sx * 0.023 * H
                u = (p.x - cxa) / (0.02 * H)
                w = (p.z - cz) / hz
                if u * u + w * w < 1.0:
                    k = 1 - u * u - w * w
                    d += 0.008 * H * k ** 0.7
                    # Grooves between the blocks.
                    if k < 0.3 and j.waist.z - 0.05 * H < p.z < j.chest.z - 0.026 * H:
                        dark = max(dark, 0.7 * (1 - k / 0.3))
            # Linea alba.
            if abs(p.x) < 0.007 * H and j.waist.z - 0.05 * H < p.z < j.chest.z - 0.025 * H:
                d -= 0.003 * H
                dark = max(dark, 0.8 * (1 - abs(p.x) / (0.007 * H)))
            # Obliques and the iliac furrow (the "V").
            ob = bump(p, Vector((sx * 0.07 * H, -0.03 * H, j.waist.z - 0.01 * H)), 0.03 * H, 0.06 * H, 0.05 * H)
            d += 0.004 * H * ob
            vline = abs((p.z - (j.hip_l.z + 0.02 * H)) - (abs(p.x) - 0.03 * H) * 1.3)
            if abs(p.x) < 0.075 * H and j.hip_l.z - 0.02 * H < p.z < j.waist.z - 0.02 * H and vline < 0.008 * H:
                d -= 0.003 * H * (1 - vline / (0.008 * H))
                dark = max(dark, 0.6 * (1 - vline / (0.008 * H)))
            # Collarbones.
            cl = abs(p.z - (j.neck_base.z - 0.012 * H - abs(p.x) * 0.12))
            if 0.012 * H < abs(p.x) < 0.085 * H and cl < 0.006 * H:
                d += 0.0032 * H * (1 - cl / (0.006 * H))
            if 0.012 * H < abs(p.x) < 0.075 * H and 0.006 * H < (j.neck_base.z - 0.012 * H - abs(p.x) * 0.12) - p.z < 0.014 * H:
                dark = max(dark, 0.35)
        if on_torso and not front:
            # Shoulder blades and the spinal groove.
            d += 0.006 * H * bump(p, Vector((sx * 0.05 * H, 0.06 * H, j.chest.z + 0.02 * H)), 0.045 * H, 0.06 * H, 0.06 * H)
            if abs(p.x) < 0.01 * H and j.waist.z - 0.04 * H < p.z < j.upper_chest.z:
                d -= 0.004 * H * (1 - abs(p.x) / (0.01 * H))
            # Lats flare under the arms.
            d += 0.005 * H * bump(p, Vector((sx * 0.085 * H, 0.03 * H, j.chest.z - 0.02 * H)), 0.03 * H, 0.06 * H, 0.08 * H)
        # Trapezius: the slope from neck to shoulder.
        d += 0.008 * H * bump(p, Vector((sx * 0.05 * H, 0.012 * H, j.neck_base.z - 0.006 * H)), 0.05 * H, 0.04 * H, 0.03 * H)
        for side, a, e in side_arm:
            if side != sx:
                continue
            # Deltoid cap over the shoulder joint.
            d += 0.011 * H * bump(p, a + Vector((side * 0.012 * H, 0, 0.006 * H)), 0.05 * H, 0.05 * H, 0.05 * H)
            # Biceps (front) and triceps (back) along the upper arm.
            mid = a.lerp(e, 0.5)
            ax = (e - a).normalized()
            rel = p - mid
            along = rel.dot(ax)
            if abs(along) < 0.09 * H:
                radial = rel - ax * along
                k = (1 - (along / (0.09 * H)) ** 2)
                if radial.length > 1e-6:
                    r = radial.normalized()
                    d += 0.011 * H * k * max(0.0, -r.y) ** 1.5  # biceps
                    d += 0.008 * H * k * max(0.0, r.y) ** 1.5  # triceps
            # Deltoid's lower edge.
            rel = p - a
            along = rel.dot((e - a).normalized())
            if 0.05 * H < along < 0.075 * H:
                dark = max(dark, 0.35 * (1 - abs(along - 0.062 * H) / (0.013 * H)))
        # Legs: quads, the knee, a calf that tapers into a slim ankle.
        if p.z < j.hip_l.z and abs(p.x) > 0.006 * H:
            sxl = 1 if p.x >= 0 else -1
            hip = Vector((j.hip_l.x * sxl, j.hip_l.y, j.hip_l.z))
            knee = Vector((j.knee_l.x * sxl, j.knee_l.y, j.knee_l.z))
            ank = Vector((j.ankle_l.x * sxl, j.ankle_l.y, j.ankle_l.z))
            if p.z > knee.z:
                c = hip.lerp(knee, 0.55)
                d += 0.01 * H * bump(p, c + Vector((sxl * 0.01 * H, -0.03 * H, 0)), 0.05 * H, 0.04 * H, 0.12 * H)  # quads
                d += 0.006 * H * bump(p, c + Vector((sxl * 0.035 * H, 0.0, 0.02 * H)), 0.03 * H, 0.05 * H, 0.1 * H)  # outer thigh
            d += 0.004 * H * bump(p, knee + Vector((0, -0.03 * H, 0.004 * H)), 0.022 * H, 0.02 * H, 0.022 * H)  # kneecap
            if ank.z < p.z < knee.z:
                calf_c = knee.lerp(ank, 0.3) + Vector((sxl * 0.004 * H, 0.03 * H, 0))
                d += 0.012 * H * bump(p, calf_c, 0.04 * H, 0.04 * H, 0.1 * H)
                # Slimmer lower shin and ankle.
                k = t_ = (knee.z - p.z) / (knee.z - ank.z)
                d -= 0.006 * H * max(0.0, (k - 0.55) / 0.45) ** 1.2
                _ = t_
        shade_vals[v.index] = dark
        v.co = p + n * d * amount
    bm.verts.index_update()
    bm.to_mesh(me)
    bm.free()
    me.update()
    # Anatomy shading baked into a vertex colour (the toon material multiplies it).
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for i in range(len(me.vertices)):
        k = 1.0 - 0.5 * min(1.0, shade_vals.get(i, 0.0) * 1.3)
        col.data[i].color = (k, k * 0.96, k * 0.95, 1.0)


def _breast_wrap(p: Vector, br: dict, j: Joints, wall_y: float) -> None:
    """Wrap the chest wall over two breasts modelled as volumes (in place).

    Each breast is an ellipsoid attached to the chest wall: centred at
    +-x and `z` above the chest joint, `sink` behind the chest wall there
    (`wall_y`, measured on the mesh; fractions of H), half-width `ax`, projection `ay` (a
    little more below, `sag`, so the lower half is the fuller one), height
    `up` above and `low` below its centre, turned outward by `yaw`
    radians. A surface point inside it is pushed out to its surface along
    the line from its centre; a smooth maximum (`blend`, wider above, crisp
    below for the under-bust fold) attaches it to the wall without a seam.
    """
    H = j.H
    side = math.copysign(1.0, p.x) if p.x != 0 else 1.0
    c = Vector((side * br["x"] * H, wall_y + br["sink"] * H, j.chest.z + br["z"] * H))
    d = p - c
    if d.length < 1e-9:
        return
    # Local frame: forward is turned outward by yaw.
    yaw = br.get("yaw", 0.0)
    fwd = Vector((side * math.sin(yaw), -math.cos(yaw), 0.0))
    lat = Vector((side * math.cos(yaw), math.sin(yaw), 0.0))
    a, b, h = d.dot(lat), d.dot(fwd), d.z
    if b < -0.6 * br["ay"] * H:
        return  # well behind the breast: the chest wall, untouched
    # Fuller below (sag); flatter above (top), so the upper half slopes up
    # into the chest rather than reading as a sphere set on it.
    ay = br["ay"] * (1 + br.get("sag", 0.0) * max(0.0, -h) / (br["low"] * H)) * (1 - br.get("top", 0.0) * min(1.0, max(0.0, h) / (br["up"] * H)))
    az = br["up"] if h > 0 else br["low"]
    rp = d.length
    u = Vector((a, b, h)) / rp
    re = 1.0 / math.sqrt((u.x / (br["ax"] * H)) ** 2 + (u.y / (ay * H)) ** 2 + (u.z / (az * H)) ** 2)
    t = min(1.0, max(0.0, (u.z + 0.25) / 0.5))
    k = (br.get("fold", 0.003) + (br.get("blend", 0.01) - br.get("fold", 0.003)) * t * t * (3 - 2 * t)) * H
    # The outer side also blends softly into the side of the chest.
    o = min(1.0, max(0.0, u.x / 0.7))
    k = max(k, br.get("blend_out", 0.0) * H * o * o * (3 - 2 * o))
    if rp - re > 4 * k:
        return
    r = (rp + re + math.sqrt((rp - re) ** 2 + k * k)) / 2
    if r > rp:
        p += d * (r / rp - 1)


def _sculpt_torso(p: Vector, ts: dict, j: Joints) -> None:
    """Soft anime body forms below the chest (in place): a waist that tapers
    without pinching, a gentle hip flare into the thighs, a belly with a
    soft plane change (a little in under the ribcage, gently rounded
    lower down), a small navel, and the curve of the lower back. All
    amounts are fractions of H; everything is a smooth Gaussian bump."""
    H = j.H

    def g(v: float, c: float, w: float) -> float:
        return math.exp(-((v - c) / w) ** 2)

    z = p.z / H
    ax = abs(p.x) / H
    if ax < 0.16:
        # Width: in at the waist, out over the hips (thighs follow).
        wz = j.waist.z / H + ts.get("waist_dz", 0.0)
        hz = j.hips.z / H + ts.get("hip_dz", 0.0)
        p.x *= 1 - ts.get("waist_in", 0.0) * g(z, wz, 0.05) + ts.get("hip_out", 0.0) * g(z, hz, 0.04)
        # The upper thighs carry the hips' line on down (outer side fuller).
        if ts.get("thigh_out") and z < j.hips.z / H:
            tz = j.hip_l.z / H - 0.035
            p.x *= 1 + ts["thigh_out"] * g(z, tz, 0.05) * min(1.0, ax / 0.04)
    if p.y < 0 and ax < 0.1:
        across = max(0.0, 1 - (ax / 0.085) ** 2)
        # Just under the ribcage the front settles in a little ...
        p.y += ts.get("under_ribs", 0.0) * H * g(z, j.chest.z / H - 0.05, 0.018) * max(0.0, 1 - (ax / 0.05) ** 2)
        # ... and the lower belly is gently rounded.
        p.y -= ts.get("belly", 0.0) * H * g(z, j.waist.z / H - 0.04, 0.03) * across
        # A very light hint of the front of the hip bones.
        if ts.get("iliac"):
            iz = j.hips.z / H + 0.03
            p.y -= ts["iliac"] * H * g(ax, 0.058, 0.016) * g(z, iz, 0.022)
    if p.y > 0 and ax < 0.09:
        # The small of the back curves in.
        p.y -= ts.get("lumbar", 0.0) * H * g(z, j.waist.z / H, 0.045) * max(0.0, 1 - (ax / 0.09) ** 2)


def _navel(obj, ts: dict, j: Joints) -> None:
    """A small, understated navel: a soft vertical dimple (pressed in after
    the torso is smoothed, which would otherwise erase it)."""
    H = j.H
    nz = j.waist.z / H + ts.get("navel_dz", -0.012)
    rx, rz = ts.get("navel_rx", 0.0035), ts.get("navel_rz", 0.006)
    for v in obj.data.vertices:
        p = v.co
        if p.y >= 0:
            continue
        r = math.hypot(p.x / H / rx, (p.z / H - nz) / rz)
        if r < 1:
            # Deepest a little above its centre, as the upper lip overhangs.
            k = (1 - r * r) ** 2 * (1 + 0.25 * max(-1.0, min(1.0, (p.z / H - nz) / rz)))
            p.y += ts["navel"] * H * k


def _smooth_torso(obj, j: Joints, iterations: int = 4) -> None:
    """Relax the whole torso a little (shrink-free), so the chest, waist,
    belly and hips read as one continuous surface without visible rows."""
    H = j.H
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    z0, z1 = j.hip_l.z - 0.04 * H, j.neck_base.z - 0.01 * H

    def weight(p: Vector) -> float:
        if not z0 < p.z < z1 or (p.z > j.chest.z - 0.01 * H and abs(p.x) > 0.11 * H):
            return 0.0
        m = min(1.0, (p.z - z0) / (0.02 * H), (z1 - p.z) / (0.02 * H))
        return m * m * (3 - 2 * m)

    ws = {v: weight(v.co) for v in bm.verts}
    verts = [v for v in bm.verts if ws[v] > 0]
    nbrs = {v: [e.other_vert(v) for e in v.link_edges] for v in verts}
    for _ in range(iterations):
        for f in (0.5, -0.53):
            moved = {}
            for v in verts:
                if nbrs[v]:
                    avg = sum((w.co for w in nbrs[v]), Vector()) / len(nbrs[v])
                    moved[v] = v.co + (avg - v.co) * f * ws[v]
            for v, co in moved.items():
                v.co = co
    bm.to_mesh(me)
    bm.free()


def _smooth_breasts(obj, br: dict, j: Joints, iterations: int = 24) -> None:
    """Relax the wrapped breasts into smooth, continuous curvature (Taubin
    lambda/mu, so they don't shrink), fading out to the untouched torso."""
    H = j.H
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    z0 = j.chest.z + (br["z"] - br["low"] - 0.02) * H
    z1 = j.chest.z + (br["z"] + br["up"] + 0.012) * H

    def weight(p: Vector) -> float:
        if p.y > 0.015 * H or abs(p.x) > 0.13 * H or not z0 < p.z < z1:
            return 0.0
        m = min(p.z - z0, z1 - p.z, 0.13 * H - abs(p.x), 0.015 * H - p.y) / (0.012 * H)
        m = min(1.0, m)
        return m * m * (3 - 2 * m)

    ws = {v: weight(v.co) for v in bm.verts}
    verts = [v for v in bm.verts if ws[v] > 0]
    nbrs = {v: [e.other_vert(v) for e in v.link_edges] for v in verts}
    for _ in range(iterations):
        for f in (0.5, -0.53):
            moved = {}
            for v in verts:
                if nbrs[v]:
                    avg = sum((w.co for w in nbrs[v]), Vector()) / len(nbrs[v])
                    moved[v] = v.co + (avg - v.co) * f * ws[v]
            for v, co in moved.items():
                v.co = co
    bm.to_mesh(me)
    bm.free()


def shape_body(obj, s: BodySpec, j: Joints) -> None:
    """Post-skin sculpting: chest plane, bust, buttocks, shoulder blades, flat soles."""
    H = j.H
    me = obj.data
    br = s.extra.get("breasts")
    ts = s.extra.get("torso_sculpt")
    wall_y = 0.0
    if br:
        # The chest wall where each breast sits (after the flattening below).
        near = [v.co.y for v in me.vertices if v.co.y < 0 and abs(abs(v.co.x) - br["x"] * H) < 0.008 * H and abs(v.co.z - j.chest.z - br["z"] * H) < 0.008 * H]
        wall_y = (min(near) if near else -0.04 * H) * 0.92
    for vert in me.vertices:
        p = vert.co
        # Flatten the front of the torso a little (less tube-like).
        if j.waist.z < p.z < j.neck_base.z and abs(p.x) < 0.11 * H and p.y < 0:
            p.y *= 0.92
        if ts:
            _sculpt_torso(p, ts, j)
        # Bust
        bs = s.extra.get("bust_shape")
        if br and p.y < 0.01 * H:
            _breast_wrap(p, br, j, wall_y)
        elif bs and p.y < 0:
            # A shaped bust: a gentle slope above, a rounder curve below
            # that tucks under (extents scaled separately above and below).
            c = Vector((bs["x"] * H * math.copysign(1, p.x if p.x != 0 else 1), -0.045 * H, j.chest.z + bs["z"] * H))
            q = p - c
            q.z *= bs["upper"] if q.z > 0 else bs["lower"]
            d = q.length / (bs["r"] * H)
            if d < 1:
                # "round" fills out the lower pole: below the centre the
                # profile stays full longer (its fullest point a little
                # below the centre) and turns back in more quickly at the
                # bottom, so there is a clear under-bust fold.
                w = 0.0
                if q.z < 0 and bs.get("round"):
                    v = min(1.0, -q.z / (bs["r"] * H) / 0.4)
                    w = bs["round"] * v * v * (3 - 2 * v) * q.z * q.z / max(q.x * q.x + q.z * q.z, 1e-12)
                bump = bs["depth"] * H * (1 - d * d) ** (2.0 - 1.2 * w)
                p.y -= bump
                # "side" fills the bust out sideways too on its outer half,
                # so it widens the front silhouette, not only the profile.
                out = q.x * math.copysign(1, p.x if p.x != 0 else 1)
                if bs.get("side") and out > 0:
                    p.x += math.copysign(1, p.x) * bs["side"] * bump * min(1.0, out / (0.6 * bs["r"] * H))
        elif s.bust > 0 and p.y < 0:
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
    if ts:
        _smooth_torso(obj, j)
        if ts.get("navel"):
            _navel(obj, ts, j)
    if br:
        _smooth_breasts(obj, br, j)


# --------------------------------------------------------------------------- hands


def _tube(bm, pts: list[Vector], radii: list[float], sides: int = 8, cap_end: bool = True) -> None:
    """Sweep a round tube along pts with per-point radii; rounded tip."""
    rows = []
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 0, 1)) if abs(tan.z) < 0.9 else Vector((1, 0, 0))
        a = tan.cross(ref).normalized()
        b = tan.cross(a).normalized()
        row = [bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * radii[i]) for k in range(sides)]
        rows.append(row)
    for i in range(len(rows) - 1):
        for k in range(sides):
            bm.faces.new((rows[i][k], rows[i][(k + 1) % sides], rows[i + 1][(k + 1) % sides], rows[i + 1][k]))
    bm.faces.new(list(reversed(rows[0])))
    if cap_end:
        tan = (pts[-1] - pts[-2]).normalized()
        tip = bm.verts.new(pts[-1] + tan * radii[-1] * 0.9)
        for k in range(sides):
            bm.faces.new((rows[-1][k], rows[-1][(k + 1) % sides], tip))


def build_hand(name: str, s: BodySpec, j: Joints, side: int) -> bpy.types.Object:
    """Slender anime hand in a relaxed pose: flattened palm, four curled
    fingers and a thumb. Built for the left hand and mirrored for the right."""
    H = j.H
    L = s.limb
    wrist = j.wrist_l
    d = (j.hand_end_l - j.wrist_l).normalized()  # along the hand
    w = Vector((0, 1, 0))  # across the palm (+y = pinky side, towards the back)
    w = (w - d * d.dot(w)).normalized()
    n = w.cross(d).normalized()  # palm side
    bm = bmesh.new()
    # Palm: flattened ellipsoid
    palm = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    centre = wrist + d * 0.046 * H
    basis = Matrix((d * 0.047 * H * L, w * 0.034 * H * L, n * 0.0135 * H * L)).transposed()
    for vtx in palm["verts"]:
        c = vtx.co.copy()
        # Slightly cupped: the palm side is flatter than the back.
        if c.z > 0:
            c.z *= 0.7
        vtx.co = centre + basis @ c
    # Fingers: index (thumb side, -w) to pinky
    specs = [(-0.022, 0.043, 1.0), (-0.0075, 0.047, 1.0), (0.0075, 0.044, 0.96), (0.021, 0.035, 0.86)]
    for off, length, rs in specs:
        base = wrist + d * 0.082 * H + w * off * H * L - n * 0.002 * H
        pts = [base]
        seg = length * H * L / 3
        direction = (d + w * off * 1.6).normalized()
        for bend in (14, 22, 16):
            direction = (Matrix.Rotation(math.radians(bend), 3, w) @ direction).normalized()
            pts.append(pts[-1] + direction * seg)
        r0 = 0.0064 * H * L * rs
        _tube(bm, pts, [r0, r0 * 0.94, r0 * 0.86, r0 * 0.76])
    # Thumb: from the heel of the palm, forward and across
    tb = wrist + d * 0.022 * H - w * 0.022 * H * L + n * 0.004 * H
    tdir = (d * 0.62 - w * 0.55 + n * 0.5).normalized()
    pts = [tb]
    for bend, ln in ((10, 0.026), (20, 0.022), (18, 0.018)):
        tdir = (Matrix.Rotation(math.radians(-bend), 3, (tdir.cross(n)).normalized()) @ tdir).normalized()
        pts.append(pts[-1] + tdir * ln * H * L)
    r0 = 0.0085 * H * L
    _tube(bm, pts, [r0, r0 * 0.95, r0 * 0.85, r0 * 0.75])
    # Anime hands are small and slender (children's even more so).
    hs = 0.84 if s.heads_tall >= 5.5 else 0.74
    for vtx in bm.verts:
        vtx.co = wrist + (vtx.co - wrist) * hs
    if side < 0:
        for vtx in bm.verts:
            vtx.co.x = -vtx.co.x
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    sub = obj.modifiers.new("Sub", "SUBSURF")
    sub.levels = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sub.name)
    return obj

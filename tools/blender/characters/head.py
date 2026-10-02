"""Anime head: sculpted ellipsoid with tapered chin, flat face plane and a
front planar UV projection. The engine paints eyes, brows and mouth into
that UV space at runtime (expressions, blinks, gaze and lip-sync)."""
from __future__ import annotations

import math
from dataclasses import dataclass

import bpy  # noqa: F401
import bmesh
from mathutils import Vector

from humanoid import Joints


@dataclass
class HeadSpec:
    width: float = 0.86  # relative to head height
    depth: float = 0.94
    jaw: float = 0.45  # chin taper strength
    chin_point: float = 0.6
    cheek: float = 0.25
    nose: float = 1.0
    ear: float = 1.0
    elf_ear: float = 0.0  # Emilia is a half-elf
    # Long elf ears that stand out from the head (angled out, back and a
    # little up, clear of the hair) instead of lying flat along it.
    elf_out: float = 0.0


def sculpt(n: Vector, h: HeadSpec) -> Vector:
    """Unit-sphere point → sculpted head point in normalised head space
    (x: width radius units, y: depth radius units, z: height radius units)."""
    x, y, z = n.x, n.y, n.z
    front = max(0.0, -y)
    # Lower face tapers into a soft V chin.
    if z < 0.15:
        t = min(1.0, (0.15 - z) / 1.15)
        x *= 1.0 - h.jaw * t**1.25
        y *= 1.0 - 0.22 * t * (1 if y > 0 else 0.5)
        if front > 0.2:
            z -= h.chin_point * 0.05 * t**2 * front
    # Flatten the face plane (anime faces are broad and flat at the eyes),
    # fading out toward the forehead so the profile stays one smooth line.
    if y < -0.25 and z < 0.6:
        w = 1.0 if z < 0.35 else 1.0 - (z - 0.35) / 0.25
        y = y + ((-0.25 + (y + 0.25) * 0.6) - y) * w
    # Cheeks
    cheek = math.exp(-(((abs(x) - 0.55) / 0.25) ** 2 + ((z + 0.2) / 0.25) ** 2)) * front
    x += math.copysign(h.cheek * 0.04 * cheek, x)
    # Cranium: fuller at the back and top.
    if y > 0:
        y *= 1.08
    if z > 0.3:
        x *= 1.02
    return Vector((x, y, z))


def build_head(name: str, j: Joints, h: HeadSpec) -> tuple[bpy.types.Object, dict]:
    H = j.head_h
    c = j.head_center
    rw = H * 0.5 * h.width
    rd = H * 0.5 * h.depth
    rh = H * 0.5
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1.0)
    for v in bm.verts:
        q = sculpt(v.co.copy(), h)
        v.co = Vector((c.x + q.x * rw, c.y + q.y * rd, c.z + q.z * rh))
    # Nose: a small, soft bump on the face plane (anime profile, not a beak).
    nose_tip = Vector((c.x, 0, c.z - rh * 0.18))
    for v in bm.verts:
        d = (Vector((v.co.x, 0, v.co.z)) - nose_tip).length / (0.09 * H)
        if d < 1 and v.co.y < c.y - rd * 0.2:
            v.co.y -= 0.007 * H * h.nose * (1 - d) ** 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # Front planar UVs over the whole head (face canvas covers a 2R square).
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for loop in f.loops:
            p = loop.vert.co
            u = 0.5 + (p.x - c.x) / (2 * rw * 1.02)
            vv = 0.5 + (p.z - c.z) / (2 * rh * 1.02)
            loop[uv].uv = (u, vv)

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    ears = build_ears(name + "_ears", j, h, rw, rh)
    meta = {
        "faceCenter": [c.x, c.z],
        "faceHalfWidth": rw * 1.02,
        "faceHalfHeight": rh * 1.02,
        # Where the eyes sit in face-UV space (0..1), used by the face painter.
        "eyeLine": 0.44,
    }
    return obj, {"ears": ears, **meta}


def build_ears(name: str, j: Joints, h: HeadSpec, rw: float, rh: float) -> bpy.types.Object:
    H = j.head_h
    c = j.head_center
    objs = []
    for side in (1, -1):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)
        ln = 0.13 * H * h.ear * (1 + 1.4 * h.elf_ear)
        if h.elf_out > 0:
            # A pointed leaf: wide at the root, tapering to a sharp tip that
            # curls up a little, standing out from the side of the head.
            d = Vector((side * 0.9, 0.24, 0.42 * h.elf_out)).normalized()
            upv = (Vector((0, 0, 1)) - d * d.z).normalized()
            nrm = d.cross(upv).normalized()
            base = Vector((c.x + side * rw * 0.86, c.y + 0.03 * H, c.z - rh * 0.12))
            for v in bm.verts:
                u = v.co.z  # -1 root .. 1 tip
                taper = (1 - max(0.0, u)) ** 0.75 * (1 + 0.15 * min(0.0, u))
                lz = u * ln * 0.5
                ly = v.co.y * 0.05 * H * h.ear * taper + 0.18 * ln * max(0.0, u) ** 2
                lx = v.co.x * 0.02 * H * max(0.4, taper)
                v.co = base + d * (lz + ln * 0.42) + upv * ly + nrm * lx
        else:
            for v in bm.verts:
                v.co = Vector((v.co.x * 0.012 * H, v.co.y * 0.045 * H * h.ear, v.co.z * ln * 0.5))
                if h.elf_ear > 0 and v.co.z > 0:
                    # pointed tip, swept back
                    v.co.y += v.co.z * 0.6 * h.elf_ear
            pos = Vector((c.x + side * rw * 0.97, c.y + 0.02 * H, c.z - rh * 0.1))
            for v in bm.verts:
                rot = Vector((v.co.x * math.cos(0.3) - v.co.y * math.sin(0.3) * side, v.co.x * math.sin(0.3) * side + v.co.y * math.cos(0.3), v.co.z))
                v.co = pos + rot
        me = bpy.data.meshes.new(f"{name}{side}")
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f"{name}{side}", me)
        bpy.context.scene.collection.objects.link(o)
        for p in me.polygons:
            p.use_smooth = True
        objs.append(o)
    # Join only the two ears: deselect everything else first (join merges
    # every selected object into the active one).
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    return out

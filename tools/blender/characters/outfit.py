"""Clothing: material zoning of the skin-modifier body, plus garment meshes
(collars, skirts, capes, aprons, belts) that the engine can drive with
spring-bone chains."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

import bpy  # noqa: F401
import bmesh
from mathutils import Vector

from humanoid import Joints


# --------------------------------------------------------------------------- materials


def make_material(name: str, rgb: tuple[float, float, float], role: str = "cloth", **extra) -> bpy.types.Material:
    """Character material. Base colour and a `role` custom prop drive the engine's toon shader."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    lin = tuple(srgb_to_linear(c) for c in rgb)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.7
    mat["role"] = role
    for k, v in extra.items():
        mat[k] = v
    return mat


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex3(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


# --------------------------------------------------------------------------- zoning


@dataclass
class ZoneContext:
    j: Joints
    p: Vector  # face centre
    n: Vector  # face normal

    # Arm parametrisation: (side, s along arm in metres from the shoulder joint, radial dir)
    def arm(self):
        j = self.j
        side = 1 if self.p.x >= 0 else -1
        arm = Vector((j.arm_l.x * side, j.arm_l.y, j.arm_l.z))
        wrist = Vector((j.wrist_l.x * side, j.wrist_l.y, j.wrist_l.z))
        d = (wrist - arm)
        length = d.length
        d.normalize()
        s = (self.p - arm).dot(d)
        radial = (self.p - arm) - d * s
        return side, s, length, d, radial

    @property
    def H(self) -> float:
        return self.j.H

    def on_arm(self) -> bool:
        side, s, length, d, radial = self.arm()
        return s > -0.01 * self.H and radial.length < 0.07 * self.H and abs(self.p.x) > self.j.arm_l.x * 0.72

    def arm_s(self) -> float:
        return self.arm()[1]

    def arm_len(self) -> float:
        return self.arm()[2]

    def beyond_wrist(self) -> bool:
        side, s, length, d, radial = self.arm()
        return self.on_arm() and s > length - 0.004 * self.H

    def arm_up_dot(self) -> float:
        """How much the face normal points to the outer-top of the sleeve."""
        side, s, length, d, radial = self.arm()
        perp = Vector((0, 0, 1)) - d * d.z
        perp = (perp + Vector((side * 0.35, 0, 0))).normalized()
        return self.n.dot(perp)

    def leg_side_dot(self) -> float:
        side = 1 if self.p.x >= 0 else -1
        return self.n.dot(Vector((side, 0, 0)))


Rule = tuple[str, Callable[[ZoneContext], bool]]


def zone(obj: bpy.types.Object, j: Joints, rules: list[Rule], materials: dict[str, bpy.types.Material], default: str) -> None:
    """Assign per-face materials by the first matching rule."""
    me = obj.data
    me.materials.clear()
    names = [default] + [r[0] for r in rules if r[0] != default]
    order = list(dict.fromkeys(names))
    for n in order:
        me.materials.append(materials[n])
    idx = {n: i for i, n in enumerate(order)}
    for poly in me.polygons:
        ctx = ZoneContext(j, Vector(poly.center), Vector(poly.normal))
        chosen = default
        for name, pred in rules:
            if pred(ctx):
                chosen = name
                break
        poly.material_index = idx[chosen]


# --------------------------------------------------------------------------- garments


def ring_band(name: str, centre: Vector, radius_x: float, radius_y: float, height: float, flare: float, mat, segments: int = 32, thickness: float = 0.004) -> bpy.types.Object:
    """Stand-up collar / cuff / belt: a short open cylinder with flare and thickness."""
    bm = bmesh.new()
    rows = []
    for zi, z in enumerate((0.0, height)):
        f = 1 + flare * zi
        row = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            row.append(bm.verts.new(centre + Vector((math.sin(a) * radius_x * f, -math.cos(a) * radius_y * f, z))))
        rows.append(row)
    for i in range(segments):
        bm.faces.new((rows[0][i], rows[0][(i + 1) % segments], rows[1][(i + 1) % segments], rows[1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 1.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    for p in me.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    return obj


@dataclass
class SkirtSpec:
    top_z: float  # fraction of H
    length: float  # fraction of H
    top_rx: float  # fraction of H
    top_ry: float
    flare: float = 1.8  # bottom radius multiplier
    folds: int = 12
    fold_depth: float = 0.12
    open_front: float = 0.0  # radians of opening at the front (Beatrice)
    layers: int = 1
    chain_count: int = 8
    chain_bones: int = 3
    hem_frill: bool = False


def skirt(name: str, j: Joints, s: SkirtSpec, mat, frill_mat=None) -> tuple[bpy.types.Object, list[list[Vector]]]:
    """Pleated / flared skirt with optional front opening. Returns chain guide lines."""
    H = j.H
    bm = bmesh.new()
    seg = 64
    rows = 10
    grid = []
    top_z = s.top_z * H
    for r in range(rows + 1):
        t = r / rows
        z = top_z - s.length * H * t
        k = 1 + (s.flare - 1) * (t**0.85)
        row = []
        for i in range(seg + 1):
            a = -math.pi + s.open_front / 2 + (2 * math.pi - s.open_front) * i / seg
            fold = 1 + s.fold_depth * t * math.sin(a * s.folds) ** 2
            rx = s.top_rx * H * k * fold
            ry = s.top_ry * H * k * fold
            # a = 0 is the back; the front sits at ±pi
            row.append(bm.verts.new(Vector((math.sin(a) * rx, math.cos(a) * ry, z))))
        grid.append(row)
    closed = s.open_front == 0.0
    for r in range(rows):
        for i in range(seg):
            bm.faces.new((grid[r][i], grid[r][i + 1], grid[r + 1][i + 1], grid[r + 1][i]))
    if closed:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.004
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    for p in me.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    # Chain guide lines (for spring bones) evenly around the skirt.
    guides = []
    for c in range(s.chain_count):
        a = -math.pi + s.open_front / 2 + (2 * math.pi - s.open_front) * (c + 0.5) / s.chain_count
        line = []
        for b in range(s.chain_bones + 1):
            t = b / s.chain_bones
            z = top_z - s.length * H * t
            k = 1 + (s.flare - 1) * (t**0.85)
            line.append(Vector((math.sin(a) * s.top_rx * H * k, math.cos(a) * s.top_ry * H * k, z)))
        guides.append(line)
    return obj, guides


def cape(name: str, j: Joints, width: float, length: float, mat, tatters: float = 0.0, chains: int = 4, bones: int = 4) -> tuple[bpy.types.Object, list[list[Vector]]]:
    """Cloak hanging from the shoulders down the back."""
    H = j.H
    bm = bmesh.new()
    cols, rows = 16, 14
    top_z = j.upper_chest.z + 0.02 * H
    grid = []
    for r in range(rows + 1):
        t = r / rows
        row = []
        for c in range(cols + 1):
            u = c / cols - 0.5
            spread = width * H * (1 + 0.35 * t)
            x = u * spread
            # wrap around the back and over the shoulders
            wrap = math.cos(u * math.pi * 0.9)
            y = 0.06 * H + 0.04 * H * wrap * (1 - t * 0.5) + t * 0.03 * H
            z = top_z - length * H * t
            if tatters > 0 and r == rows:
                z += tatters * H * 0.05 * (0.5 + 0.5 * math.sin(c * 2.7) * math.cos(c * 1.3))
            row.append(bm.verts.new(Vector((x, y, z))))
        grid.append(row)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.005
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    for p in me.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    guides = []
    for ci in range(chains):
        u = (ci + 0.5) / chains - 0.5
        line = []
        for b in range(bones + 1):
            t = b / bones
            spread = width * H * (1 + 0.35 * t)
            line.append(Vector((u * spread, 0.1 * H, top_z - length * H * t)))
        guides.append(line)
    return obj, guides


def apron(name: str, j: Joints, top_z: float, length: float, width: float, mat) -> tuple[bpy.types.Object, list[list[Vector]]]:
    """Maid apron panel in front of the skirt."""
    H = j.H
    bm = bmesh.new()
    cols, rows = 8, 8
    grid = []
    for r in range(rows + 1):
        t = r / rows
        row = []
        for c in range(cols + 1):
            u = c / cols - 0.5
            x = u * width * H * (1 + 0.5 * t)
            y = -0.07 * H - t * 0.05 * H - 0.02 * H * math.cos(u * math.pi)
            row.append(bm.verts.new(Vector((x, y, top_z * H - length * H * t))))
        grid.append(row)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.003
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    obj.data.materials.append(mat)
    line = [Vector((0, -0.08 * H - t * 0.05 * H, top_z * H - length * H * t)) for t in (0, 0.5, 1.0)]
    return obj, [line]


@dataclass
class Garments:
    objects: list = field(default_factory=list)
    # chain name -> guide polyline (spring-bone chains)
    chains: dict[str, list[Vector]] = field(default_factory=dict)
    # object name -> list of chain names that deform it
    bindings: dict[str, list[str]] = field(default_factory=dict)

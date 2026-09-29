"""Generic creature builder: a skin-modifier body over a joint graph, an
armature from named nodes, auto (heat) weights, rigid parts (eyes, horns,
claws, jaw, tack) and glTF export.

Creatures face -Y in Blender (→ +Z in three.js), like the humanoids.
"""
from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import dataclass, field
from typing import Callable

import bpy  # noqa: F401  (must precede bmesh/mathutils)
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "characters"))

from outfit import hex3, make_material  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "assets", "models", "creatures")

NodeMap = dict[str, tuple[Vector, float, float]]


@dataclass
class Part:
    obj: bpy.types.Object
    bone: str


@dataclass
class CreatureSpec:
    id: str
    nodes: NodeMap  # name -> (position, radius_a, radius_b); ".L" nodes are mirrored
    edges: list[tuple[str, str]]
    root_node: str
    # (bone, head node, tail node, parent bone); ".L" bones are mirrored
    bones: list[tuple[str, str, str, str]]
    palette: dict[str, tuple[str, str]]
    zone: Callable[["ZoneCtx"], str]
    parts: Callable[["Builder"], list[Part]] | None = None
    sculpt: Callable[[Vector, "Builder"], Vector] | None = None
    subdiv: int = 2
    meta: dict = field(default_factory=dict)


@dataclass
class ZoneCtx:
    p: Vector
    n: Vector
    b: "Builder"


def mirror_name(n: str) -> str:
    return n[:-2] + ".R" if n.endswith(".L") else n


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def select_only(*objs) -> None:
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[-1]


class Builder:
    """Holds the resolved nodes, materials and helpers for part builders."""

    def __init__(self, spec: CreatureSpec):
        self.spec = spec
        self.nodes: NodeMap = {}
        for k, (p, a, b) in spec.nodes.items():
            self.nodes[k] = (p.copy(), a, b)
            if k.endswith(".L"):
                self.nodes[mirror_name(k)] = (Vector((-p.x, p.y, p.z)), a, b)
        self.mats = {name: make_material(f"M_{spec.id}_{name}", hex3(hx), role) for name, (hx, role) in spec.palette.items()}
        self.body: bpy.types.Object | None = None
        self._bvh: BVHTree | None = None

    def p(self, node: str) -> Vector:
        return self.nodes[node][0].copy()

    def bvh(self) -> BVHTree:
        if self._bvh is None:
            dg = bpy.context.evaluated_depsgraph_get()
            self._bvh = BVHTree.FromObject(self.body, dg)
        return self._bvh

    def surface_below(self, x: float, y: float, top: float, offset: float) -> Vector | None:
        hit = self.bvh().ray_cast(Vector((x, y, top)), Vector((0, 0, -1)))
        if hit[0] is None:
            return None
        return hit[0] + hit[1] * offset

    # ---------------------------------------------------------------- mesh helpers
    def obj(self, name: str, bm: bmesh.types.BMesh, mat: str, smooth: bool = True) -> bpy.types.Object:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        for poly in me.polygons:
            poly.use_smooth = smooth
        o.data.materials.append(self.mats[mat])
        return o

    def ellipsoid(self, name: str, centre: Vector, radii: Vector, mat: str, axis: Vector | None = None, segs=(16, 10)) -> bpy.types.Object:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
        q = Vector((0, 0, 1)).rotation_difference(axis.normalized()) if axis is not None else None
        for v in bm.verts:
            c = Vector((v.co.x * radii.x, v.co.y * radii.y, v.co.z * radii.z))
            v.co = centre + (q @ c if q else c)
        return self.obj(name, bm, mat)

    def cone(self, name: str, base: Vector, direction: Vector, length: float, radius: float, mat: str, segs: int = 8, flat: float = 1.0) -> bpy.types.Object:
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=radius, radius2=0.0, depth=length)
        for v in bm.verts:
            v.co.y *= flat
            v.co.z += length / 2
        q = Vector((0, 0, 1)).rotation_difference(direction.normalized())
        for v in bm.verts:
            v.co = base + q @ v.co
        return self.obj(name, bm, mat, smooth=False)

    def tube(self, name: str, pts: list[Vector], radii: list[float], mat: str, sides: int = 10) -> bpy.types.Object:
        bm = bmesh.new()
        rows = []
        for i, p in enumerate(pts):
            tan = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = Vector((0, 0, 1)) if abs(tan.z) < 0.9 else Vector((1, 0, 0))
            a = tan.cross(ref).normalized()
            b = tan.cross(a).normalized()
            rows.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * radii[i]) for k in range(sides)])
        for i in range(len(rows) - 1):
            for k in range(sides):
                bm.faces.new((rows[i][k], rows[i][(k + 1) % sides], rows[i + 1][(k + 1) % sides], rows[i + 1][k]))
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
        return self.obj(name, bm, mat)


def build_body(b: Builder) -> bpy.types.Object:
    spec = b.spec
    bm = bmesh.new()
    verts = {}
    order = []
    for name, (p, _, _) in b.nodes.items():
        verts[name] = bm.verts.new(p)
        order.append(name)
    edges = []
    for a, c in spec.edges:
        edges.append((a, c))
        if a.endswith(".L") or c.endswith(".L"):
            edges.append((mirror_name(a), mirror_name(c)))
    for a, c in edges:
        bm.edges.new((verts[a], verts[c]))
    me = bpy.data.meshes.new(f"{spec.id}_body")
    bm.to_mesh(me)
    bm.free()
    body = bpy.data.objects.new(f"{spec.id}_body", me)
    bpy.context.scene.collection.objects.link(body)
    skin = body.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.5
    for i, name in enumerate(order):
        sv = me.skin_vertices[0].data[i]
        _, ra, rb = b.nodes[name]
        sv.radius = (ra, rb)
        sv.use_root = name == spec.root_node
    sub = body.modifiers.new("Sub", "SUBSURF")
    sub.levels = spec.subdiv
    select_only(body)
    bpy.ops.object.modifier_apply(modifier=skin.name)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    if spec.sculpt:
        for v in body.data.vertices:
            v.co = spec.sculpt(v.co.copy(), b)
    body.data.update()
    b.body = body
    return body


def build_armature(b: Builder) -> bpy.types.Object:
    spec = b.spec
    data = bpy.data.armatures.new(f"{spec.id}_rig")
    arm = bpy.data.objects.new(spec.id, data)
    bpy.context.scene.collection.objects.link(arm)
    select_only(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones
    root = eb.new("root")
    root.head = (0, 0, 0)
    root.tail = (0, -0.2, 0)
    bones = []
    for name, h, t, parent in spec.bones:
        bones.append((name, h, t, parent))
        if name.endswith(".L"):
            bones.append((mirror_name(name), mirror_name(h), mirror_name(t), mirror_name(parent)))
    for name, h, t, parent in bones:
        e = eb.new(name)
        e.head = b.p(h)
        e.tail = b.p(t)
        e.parent = eb[parent]
        e.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def zone_body(b: Builder, body: bpy.types.Object) -> None:
    names = list(b.spec.palette.keys())
    me = body.data
    me.materials.clear()
    for n in names:
        me.materials.append(b.mats[n])
    idx = {n: i for i, n in enumerate(names)}
    for poly in me.polygons:
        z = b.spec.zone(ZoneCtx(Vector(poly.center), Vector(poly.normal), b))
        poly.material_index = idx[z]


def rigid(obj, arm, bone: str) -> None:
    obj.vertex_groups.clear()
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj.parent = arm
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def build(spec: CreatureSpec) -> str:
    reset()
    b = Builder(spec)
    arm = build_armature(b)
    body = build_body(b)
    zone_body(b, body)
    select_only(body, arm)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    parts = spec.parts(b) if spec.parts else []
    for part in parts:
        rigid(part.obj, arm, part.bone)
    arm["creature"] = spec.id
    arm["meta"] = json.dumps(spec.meta)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{spec.id}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_extras=True,
        export_skins=True,
        export_apply=True,
        export_materials="EXPORT",
        export_animations=False,
        export_def_bones=False,
    )
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"{spec.id}: {tris} tris, {len(arm.data.bones)} bones → {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1024:.0f} KB)")
    return path


def lerp(a: Vector, c: Vector, t: float) -> Vector:
    return a.lerp(c, t)


_ = Matrix  # re-exported for specs

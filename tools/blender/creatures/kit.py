"""Detail kit for creatures: feathers and fur tufts, curved claws and
teeth, straps that hug the body, and tack cut from the body itself.

All helpers return Blender objects with one material, in creature space
(-Y forward, Z up). Pair them with a Part(bone) for rigid pieces, or
Part(None) to weight them like the body surface underneath.
"""
from __future__ import annotations

import math
from typing import Callable, Iterable

import bpy  # noqa: F401
import bmesh
from mathutils import Matrix, Vector

from creature import Builder


def _finish(b: Builder, name: str, bm: bmesh.types.BMesh, mat: str, smooth: bool = True, thickness: float = 0.0) -> bpy.types.Object:
    o = b.obj(name, bm, mat, smooth=smooth)
    if thickness > 0:
        sol = o.modifiers.new("Sol", "SOLIDIFY")
        sol.thickness = thickness
        sol.use_rim = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=sol.name)
    return o


def join(objs: list, name: str):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    return out


# --------------------------------------------------------------------------- blades (feathers, fur)


def blades(b: Builder, name: str, specs: Iterable[tuple[Vector, Vector, float, float]], mat: str, *, up: Vector = Vector((0, 0, 1)), curl: float = 0.6, droop: float = 0.3, spine: float = 0.25, steps: int = 7, thickness: float = 0.004) -> bpy.types.Object | None:
    """Tapered, gently curved blades — a feather vane or a lock of fur.
    specs: (root, direction, length, width). Each blade curls about its
    side axis (towards -up by `droop`, bending by `curl`) and has a
    raised centre ridge (`spine`) so it catches light like a quill."""
    bm = bmesh.new()
    count = 0
    for root, direction, length, width in specs:
        d = direction.normalized()
        side = d.cross(up)
        if side.length < 1e-4:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        normal = side.cross(d).normalized()
        pts = [root.copy()]
        dd = d.copy()
        seg = length / steps
        for i in range(steps):
            rot = Matrix.Rotation(curl / steps, 3, side)
            dd = (rot @ dd).normalized()
            dd = (dd - up * droop / steps).normalized()
            pts.append(pts[-1] + dd * seg)
        rows = []
        for i, p in enumerate(pts):
            t = i / steps
            w = width * (math.sin(math.pi * min(1.0, t * 1.1 + 0.08)) ** 0.7) * (1 - t ** 3)
            if i == steps:
                w = 0.0
            tan = (pts[min(i + 1, steps)] - pts[max(i - 1, 0)]).normalized()
            s = tan.cross(normal).normalized()
            ridge = normal * w * spine
            rows.append((bm.verts.new(p - s * w / 2), bm.verts.new(p + ridge), bm.verts.new(p + s * w / 2)))
        for i in range(steps):
            a, c = rows[i], rows[i + 1]
            bm.faces.new((a[0], a[1], c[1], c[0]))
            bm.faces.new((a[1], a[2], c[2], c[1]))
        count += 1
    if not count:
        bm.free()
        return None
    return _finish(b, name, bm, mat, thickness=thickness)


def fan(b: Builder, name: str, root: Vector, centre_dir: Vector, spread_axis: Vector, n: int, spread: float, length: float, width: float, mat: str, **kw) -> bpy.types.Object | None:
    """A fan of blades from one root (a crest, a tail plume)."""
    specs = []
    for i in range(n):
        u = (i / max(1, n - 1)) - 0.5
        rot = Matrix.Rotation(u * spread, 3, spread_axis.normalized())
        ln = length * (1.0 - 0.35 * abs(u) * 2 + 0.08 * math.sin(i * 2.3))
        specs.append((root + spread_axis.normalized().cross(centre_dir.normalized()) * 0.0, rot @ centre_dir, ln, width))
    return blades(b, name, specs, mat, **kw)


# --------------------------------------------------------------------------- claws, teeth


def claw(b: Builder, name: str, base: Vector, direction: Vector, length: float, radius: float, mat: str, hook: float = 0.9, down: Vector = Vector((0, 0, -1)), sides: int = 8) -> bpy.types.Object:
    """A curved, tapering claw (sickle when hook is large)."""
    d = direction.normalized()
    side = d.cross(down)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    pts = [base.copy()]
    dd = d.copy()
    steps = 7
    for i in range(steps):
        dd = (Matrix.Rotation(hook / steps, 3, side) @ dd).normalized()
        pts.append(pts[-1] + dd * length / steps)
    radii = [radius * (1 - i / steps) ** 0.9 + 0.0006 for i in range(steps + 1)]
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, steps)] - pts[max(i - 1, 0)]).normalized()
        a = tan.cross(side).normalized()
        rows.append([bm.verts.new(p + (side * math.cos(2 * math.pi * k / sides) * 0.75 + a * math.sin(2 * math.pi * k / sides)) * radii[i]) for k in range(sides)])
    for i in range(steps):
        for k in range(sides):
            bm.faces.new((rows[i][k], rows[i][(k + 1) % sides], rows[i + 1][(k + 1) % sides], rows[i + 1][k]))
    bm.faces.new(list(reversed(rows[0])))
    return _finish(b, name, bm, mat)


def teeth_row(b: Builder, name: str, pts: list[Vector], direction: Vector, length: float, radius: float, mat: str) -> bpy.types.Object | None:
    objs = []
    for i, p in enumerate(pts):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=radius, radius2=0.0, depth=length * (0.8 + 0.3 * ((i * 5) % 3) / 2))
        for v in bm.verts:
            v.co.z += length / 2
        q = Vector((0, 0, 1)).rotation_difference(direction.normalized())
        for v in bm.verts:
            v.co = p + q @ v.co
        objs.append(_finish(b, f"{name}{i}", bm, mat, smooth=False))
    return join(objs, name)


# --------------------------------------------------------------------------- straps and tack


def surface(b: Builder, origin: Vector, direction: Vector, lift: float = 0.0):
    hit = b.bvh().ray_cast(origin, direction.normalized())
    if hit[0] is None:
        return None
    return hit[0] + hit[1] * lift, hit[1]


def band(b: Builder, name: str, pts: list[Vector], normals: list[Vector], width: float, mat: str, thickness: float = 0.008, closed: bool = False) -> bpy.types.Object | None:
    if len(pts) < 2:
        return None
    bm = bmesh.new()
    n = len(pts)
    rows = []
    for i, p in enumerate(pts):
        tan = (pts[(i + 1) % n] - pts[i - 1]) if closed else (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        tan.normalize()
        s = tan.cross(normals[i]).normalized()
        rows.append((bm.verts.new(p - s * width / 2), bm.verts.new(p + s * width / 2)))
    for i in range(n if closed else n - 1):
        a, c = rows[i], rows[(i + 1) % n]
        bm.faces.new((a[0], a[1], c[1], c[0]))
    return _finish(b, name, bm, mat, thickness=thickness)


def girth(b: Builder, name: str, centre: Vector, axis: Vector, width: float, mat: str, lift: float = 0.012, steps: int = 36, arc: tuple[float, float] = (0.0, 360.0)) -> tuple[bpy.types.Object | None, list[Vector]]:
    """A strap around the body (cast outward from an inside point)."""
    axis = axis.normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    pts, nrm = [], []
    closed = arc == (0.0, 360.0)
    count = steps if closed else steps + 1
    for i in range(count):
        a = math.radians(arc[0] + (arc[1] - arc[0]) * i / steps)
        r = u * math.cos(a) + v * math.sin(a)
        hit = surface(b, centre, r, lift)
        if hit is None:
            continue
        pts.append(hit[0])
        nrm.append(hit[1])
    return band(b, name, pts, nrm, width, mat, closed=closed), pts


def strap_path(b: Builder, name: str, path: list[tuple[Vector, Vector]], width: float, mat: str, lift: float = 0.012, thickness: float = 0.008) -> bpy.types.Object | None:
    pts, nrm = [], []
    for o, d in path:
        hit = surface(b, o, d, lift)
        if hit is None:
            continue
        pts.append(hit[0])
        nrm.append(hit[1])
    return band(b, name, pts, nrm, width, mat, thickness=thickness)


def body_shell(b: Builder, name: str, keep: Callable[[Vector, Vector], bool], offset: float, mat: str, extra: Callable[[Vector, Vector], float] | None = None, lip: float = 0.008) -> bpy.types.Object:
    """Cut a piece of the body's surface (helmet, saddle seat, armour) and
    lift it off: it keeps the body's skin weights."""
    src = b.body
    me = src.data.copy()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    for g in src.vertex_groups:
        o.vertex_groups.new(name=g.name)
    for ca in list(me.color_attributes):
        me.color_attributes.remove(ca)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    kill = [f for f in bm.faces if not keep(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    lifted = [v.co + v.normal * (offset + (extra(v.co.copy(), v.normal.copy()) if extra else 0.0)) for v in bm.verts]
    for v, p in zip(bm.verts, lifted):
        v.co = p
    if lip > 0:
        bm.normal_update()
        edges = [e for e in bm.edges if e.is_boundary]
        key = lambda co: (round(co.x, 6), round(co.y, 6), round(co.z, 6))  # noqa: E731
        inward = {key(v.co): -v.normal.copy() for e in edges for v in e.verts}
        res = bmesh.ops.extrude_edge_only(bm, edges=edges)
        for v in (g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)):
            n = inward.get(key(v.co))
            if n is not None:
                v.co = v.co + n * lip
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(b.mats[mat])
    for p in me.polygons:
        p.material_index = 0
        p.use_smooth = True
    o["skinned"] = True
    return o


def studs(b: Builder, name: str, points: list[tuple[Vector, Vector]], radius: float, mat: str, lift: float = 0.0, flat: float = 0.5) -> bpy.types.Object | None:
    bm = bmesh.new()
    n = 0
    for o, d in points:
        hit = surface(b, o, d, lift)
        if hit is None:
            continue
        res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=radius)
        q = Vector((0, 0, 1)).rotation_difference(hit[1])
        bmesh.ops.transform(bm, matrix=Matrix.Translation(hit[0]) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((1, 1, flat, 1)), verts=res["verts"])
        n += 1
    if not n:
        bm.free()
        return None
    return _finish(b, name, bm, mat)


def ring(b: Builder, name: str, centre: Vector, axis: Vector, radius: float, tube: float, mat: str) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, radius=1.0, segments=16)
    me_rows = []
    axis = axis.normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    bm.free()
    bm = bmesh.new()
    seg, sides = 16, 6
    for i in range(seg):
        a = 2 * math.pi * i / seg
        c = centre + (u * math.cos(a) + v * math.sin(a)) * radius
        rdir = (c - centre).normalized()
        me_rows.append([bm.verts.new(c + (rdir * math.cos(2 * math.pi * k / sides) + axis * math.sin(2 * math.pi * k / sides)) * tube) for k in range(sides)])
    for i in range(seg):
        for k in range(sides):
            bm.faces.new((me_rows[i][k], me_rows[i][(k + 1) % sides], me_rows[(i + 1) % seg][(k + 1) % sides], me_rows[(i + 1) % seg][k]))
    return _finish(b, name, bm, mat)

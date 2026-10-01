"""Shared helpers for headless Blender asset builds.

Conventions (read by the engine's KitLibrary):
  KIT_<Piece>           LOD0 render mesh, pivot at the piece's snapping origin
  KIT_<Piece>_LOD1/2    decimated LODs
  COL_<Piece>_<i>_<T>   collision proxy, T in BOX | CYL | HULL | MESH (not rendered)
Materials are named M_<texture>[_<variant>]; the engine binds textures by name.
UVs are world-scale box projections: 1 UV unit = 1 metre.
Custom properties become glTF extras (e.g. surface="stone").
"""
from __future__ import annotations

import math
import os
from typing import Iterable, Sequence

import bpy  # must precede bmesh/mathutils when bpy is used as a module
import bmesh
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------- scene


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def activate(obj: bpy.types.Object) -> None:
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def link(obj: bpy.types.Object) -> bpy.types.Object:
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name: str, bm: bmesh.types.BMesh) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    return link(obj)


# --------------------------------------------------------------------------- materials

_PREVIEW_COLORS = {
    "sandstone_ashlar": (0.8, 0.72, 0.6),
    "limestone_smooth": (0.85, 0.8, 0.7),
    "marble_tiles": (0.72, 0.74, 0.77),
    "flagstone": (0.72, 0.66, 0.55),
    "sand": (0.84, 0.72, 0.54),
    "sandglass": (0.4, 0.35, 0.27),
    "bronze": (0.72, 0.54, 0.28),
    "gold": (0.9, 0.75, 0.4),
    "wood_dark": (0.29, 0.2, 0.13),
    "fabric": (0.8, 0.8, 0.8),
    "rock": (0.6, 0.52, 0.42),
    "plaster_worn": (0.88, 0.84, 0.75),
    "leather": (0.5, 0.3, 0.2),
    "glow": (1.0, 0.8, 0.5),
    "dark": (0.05, 0.05, 0.06),
}


def material(name: str) -> bpy.types.Material:
    """Get/create material M_<name>. Base texture = text before the first '__'."""
    full = f"M_{name}"
    mat = bpy.data.materials.get(full)
    if mat:
        return mat
    mat = bpy.data.materials.new(full)
    mat.use_nodes = True
    key = name.split("__")[0]
    col = _PREVIEW_COLORS.get(key, (0.7, 0.7, 0.7))
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*col, 1)
        bsdf.inputs["Roughness"].default_value = 0.8
        if key in ("bronze", "gold"):
            bsdf.inputs["Metallic"].default_value = 1.0
    return mat


def assign(obj: bpy.types.Object, mat_name: str) -> bpy.types.Object:
    obj.data.materials.clear()
    obj.data.materials.append(material(mat_name))
    return obj


def set_face_material(obj: bpy.types.Object, mat_name: str, predicate) -> None:
    """Assign a second material to faces matching predicate(face_center, face_normal)."""
    mat = material(mat_name)
    if mat.name not in obj.data.materials:
        obj.data.materials.append(mat)
    idx = list(obj.data.materials).index(mat)
    for poly in obj.data.polygons:
        if predicate(Vector(poly.center), Vector(poly.normal)):
            poly.material_index = idx


# --------------------------------------------------------------------------- primitives


def box(name: str, size: Sequence[float], center: Sequence[float] = (0, 0, 0), mat: str | None = None) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = mesh_object(name, bm)
    if mat:
        assign(obj, mat)
    return obj


def cylinder(name: str, radius: float, depth: float, center=(0, 0, 0), segments=24, mat: str | None = None, radius_top: float | None = None) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius if radius_top is None else radius_top,
        depth=depth,
    )
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = mesh_object(name, bm)
    if mat:
        assign(obj, mat)
    return obj


def lathe(name: str, profile: Sequence[tuple[float, float]], segments=32, mat: str | None = None, cap=True) -> bpy.types.Object:
    """Revolve a (radius, z) profile around Z."""
    bm = bmesh.new()
    rings = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        ring = [bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile]
        rings.append(ring)
    for i in range(segments):
        a = rings[i]
        b = rings[(i + 1) % segments]
        for j in range(len(profile) - 1):
            if profile[j][0] <= 1e-6 and profile[j + 1][0] <= 1e-6:
                continue
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    if cap:
        if profile[0][0] > 1e-6:
            bm.faces.new([rings[i][0] for i in reversed(range(segments))])
        if profile[-1][0] > 1e-6:
            bm.faces.new([rings[i][-1] for i in range(segments)])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_object(name, bm)
    if mat:
        assign(obj, mat)
    return obj


def fluted_column_shaft(name: str, radius: float, height: float, flutes=20, depth=0.035, segments_per_flute=3, z0=0.0, taper=0.92, mat=None):
    """Column shaft with concave flutes and slight entasis taper."""
    bm = bmesh.new()
    n = flutes * segments_per_flute
    rows = 10
    grid = []
    for r in range(rows + 1):
        t = r / rows
        z = z0 + height * t
        # entasis: slight bulge then taper
        k = (1 - (1 - taper) * t) * (1 + 0.015 * math.sin(math.pi * t))
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            f = (i % segments_per_flute) / segments_per_flute
            flute = math.sin(math.pi * f)
            rr = (radius - depth * flute) * k
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        grid.append(ring)
    for r in range(rows):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((grid[r][i], grid[r][j], grid[r + 1][j], grid[r + 1][i]))
    bm.faces.new(list(reversed(grid[0])))
    bm.faces.new(grid[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_object(name, bm)
    if mat:
        assign(obj, mat)
    return obj


def rock_blob(name: str, radius: float, seed: int, detail=2, squash=(1, 1, 0.7), roughness=0.28, mat="rock"):
    """Irregular rock: displaced icosphere."""
    import random

    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=radius)
    # low-frequency lumps from a few random directional bulges
    dirs = [Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized() for _ in range(6)]
    amps = [rnd.uniform(-roughness, roughness) for _ in range(6)]
    for v in bm.verts:
        n = v.co.normalized()
        d = sum(a * max(0.0, n.dot(dd)) ** 2 for a, dd in zip(amps, dirs))
        d += rnd.uniform(-0.05, 0.05) * roughness
        v.co = v.co * (1 + d)
        v.co.x *= squash[0]
        v.co.y *= squash[1]
        v.co.z *= squash[2]
    obj = mesh_object(name, bm)
    assign(obj, mat)
    return obj


# --------------------------------------------------------------------------- operations


def apply_transform(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def bevel(obj, width=0.02, segments=2, angle_deg=35.0):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle_deg)
    mod.harden_normals = False
    apply_modifier(obj, mod)


def apply_modifier(obj, mod):
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def boolean_diff(obj, cutter, solver="EXACT"):
    mod = obj.modifiers.new("Bool", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = solver
    apply_modifier(obj, mod)
    bpy.data.objects.remove(cutter, do_unlink=True)


def join(objs: Sequence[bpy.types.Object], name: str) -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
    activate(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    return out


def shade_smooth_by_angle(obj, angle_deg=40.0):
    """Smooth shading with sharp edges above the angle (hard architecture edges stay crisp)."""
    me = obj.data
    for p in me.polygons:
        p.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(me)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            a = e.link_faces[0].normal.angle(e.link_faces[1].normal, 0)
            e.smooth = a < math.radians(angle_deg)
        else:
            e.smooth = False
    bm.to_mesh(me)
    bm.free()


def box_uv(obj, meters_per_unit=1.0):
    """World-scale box projection UVs (1 UV unit = `meters_per_unit` metres)."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    mw = obj.matrix_world
    nm = mw.to_3x3().inverted_safe().transposed()
    for f in bm.faces:
        n = (nm @ f.normal).normalized()
        ax = abs(n.x)
        ay = abs(n.y)
        az = abs(n.z)
        for loop in f.loops:
            p = mw @ loop.vert.co
            if az >= ax and az >= ay:
                u, v = p.x, p.y * (1 if n.z >= 0 else -1)
            elif ax >= ay:
                u, v = p.y * (1 if n.x >= 0 else -1), p.z
            else:
                u, v = -p.x * (1 if n.y >= 0 else -1), p.z
            loop[uv].uv = (u / meters_per_unit, v / meters_per_unit)
    bm.to_mesh(me)
    bm.free()


def cylinder_uv(obj, radius: float, meters_per_unit=1.0):
    """Cylindrical UVs around Z (columns, towers): u = arc length, v = height."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        cx = sum(l.vert.co.x for l in f.loops) / len(f.loops)
        cy = sum(l.vert.co.y for l in f.loops) / len(f.loops)
        ca = math.atan2(cy, cx)
        horizontal = abs(f.normal.z) > 0.8
        for loop in f.loops:
            p = loop.vert.co
            if horizontal:
                loop[uv].uv = (p.x / meters_per_unit, p.y / meters_per_unit)
            else:
                a = math.atan2(p.y, p.x)
                # keep a face's loops on the same side of the seam
                while a - ca > math.pi:
                    a -= 2 * math.pi
                while a - ca < -math.pi:
                    a += 2 * math.pi
                loop[uv].uv = (a * radius / meters_per_unit, p.z / meters_per_unit)
    bm.to_mesh(me)
    bm.free()


def finalize(obj, name: str, surface: str = "stone", smooth_angle=40.0, uv="box", uv_radius=1.0):
    """Name, UV, shade and tag a finished LOD0 piece."""
    obj.name = f"KIT_{name}"
    obj.data.name = f"KIT_{name}"
    if uv == "box":
        box_uv(obj)
    elif uv == "cyl":
        cylinder_uv(obj, uv_radius)
    shade_smooth_by_angle(obj, smooth_angle)
    obj["surface"] = surface
    obj["kit"] = name
    return obj


def make_lods(obj, ratios=(0.5, 0.2)):
    """Create decimated copies KIT_<name>_LOD1.. (only when the mesh is dense enough to benefit)."""
    base = obj.name
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    out = []
    for i, r in enumerate(ratios, start=1):
        if tris * r < 60:
            break
        dup = obj.copy()
        dup.data = obj.data.copy()
        dup.name = f"{base}_LOD{i}"
        dup.data.name = dup.name
        link(dup)
        mod = dup.modifiers.new("Dec", "DECIMATE")
        mod.ratio = r
        mod.use_collapse_triangulate = True
        apply_modifier(dup, mod)
        out.append(dup)
    return out


def collider_box(piece: str, index: int, size, center, rot_z=0.0):
    o = box(f"COL_{piece}_{index}_BOX", size, (0, 0, 0))
    o.rotation_euler = (0, 0, rot_z)
    o.location = center
    o["collider"] = "box"
    return o


def collider_cyl(piece: str, index: int, radius, height, center):
    # Built at the origin and moved by its location, so a rotation set
    # afterwards turns it about its own centre (a baked-in offset would
    # swing around the piece origin instead).
    o = cylinder(f"COL_{piece}_{index}_CYL", radius, height, (0, 0, 0), segments=12)
    o.location = center
    o["collider"] = "cyl"
    return o


def collider_hull(piece: str, index: int, source: bpy.types.Object):
    dup = source.copy()
    dup.data = source.data.copy()
    dup.name = f"COL_{piece}_{index}_HULL"
    dup.data.name = dup.name
    for k in list(dup.keys()):
        del dup[k]
    link(dup)
    mod = dup.modifiers.new("Dec", "DECIMATE")
    mod.ratio = 0.15
    apply_modifier(dup, mod)
    dup["collider"] = "hull"
    return dup


def export_glb(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def stats() -> dict:
    tris = 0
    pieces = 0
    for o in bpy.data.objects:
        if o.type == "MESH":
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
            if o.name.startswith("KIT_") and "_LOD" not in o.name:
                pieces += 1
    return {"pieces": pieces, "tris": tris}


def spaced(values: Iterable[float]) -> list[float]:
    return list(values)

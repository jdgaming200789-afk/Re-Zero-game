"""Tailoring: real garment layers over the body instead of painted zones.

  shell()        a garment cut from the body itself — a copy of the skinned
                 body trimmed to the garment's outline, lifted off the skin,
                 given thickness, hem flare and fold ridges. It inherits the
                 body's skin weights, so it deforms exactly like the body.
  shoe()         a modelled shoe or boot foot (sole, toe box, heel, collar).
  trim()         a thin band that follows the surface (zips, piping, stripes).
  studs()        buttons / rivets / eyelets on the surface.
  skin_like_body()  weights any prop like the body surface under it.

Everything here works in the rest (A) pose on `j.body`, the finished body
mesh (after the hands are joined), which build.py sets before garments run.
"""
from __future__ import annotations

import math
from typing import Callable, Iterable

import bpy  # noqa: F401
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from humanoid import Joints
from outfit import ZoneContext, zone


# --------------------------------------------------------------------------- helpers


def smoothstep(a: float, b: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - a) / (b - a))) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)


def _link(name: str, me) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _apply(obj, mod) -> None:
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def body_mesh_bvh(j: Joints):
    """BVH over the *base* body mesh, so polygon indices match its data."""
    cached = getattr(j, "_base_bvh", None)
    if cached is not None:
        return cached
    me = j.body.data
    verts = [v.co.copy() for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons]
    tree = BVHTree.FromPolygons(verts, polys)
    j._base_bvh = tree
    return tree


def surface_point(j: Joints, origin: Vector, direction: Vector, offset: float = 0.0):
    """Ray-cast onto the body; returns (point lifted by offset, normal) or None."""
    hit = body_mesh_bvh(j).ray_cast(origin, direction.normalized())
    if hit[0] is None:
        return None
    return hit[0] + hit[1] * offset, hit[1]


def front_point(j: Joints, x: float, z: float, offset: float = 0.0, side: float = -1.0):
    """Point on the front (side=-1) or back (+1) of the body at (x, z)."""
    o = Vector((x, side * 1.0, z))
    return surface_point(j, o, Vector((0, -side, 0)), offset)


def skin_like_body(obj: bpy.types.Object, j: Joints, exclude: Iterable[str] = ()) -> None:
    """Copy skin weights from the body surface nearest each vertex."""
    body = j.body
    bme = body.data
    tree = body_mesh_bvh(j)
    names = [g.name for g in body.vertex_groups]
    excl = set(exclude)
    # vertex index -> {group: weight}
    vw: list[dict[int, float]] = [{g.group: g.weight for g in v.groups if g.weight > 1e-4} for v in bme.vertices]
    obj.vertex_groups.clear()
    groups = {}
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        hit = tree.find_nearest(p)
        if hit[0] is None:
            continue
        poly = bme.polygons[hit[2]]
        acc: dict[int, float] = {}
        tot = 0.0
        for vi in poly.vertices:
            d = (bme.vertices[vi].co - hit[0]).length
            w = 1.0 / max(d, 1e-4)
            tot += w
            for g, gw in vw[vi].items():
                acc[g] = acc.get(g, 0.0) + gw * w
        norm = sum(acc.values()) or 1.0
        for g, gw in acc.items():
            name = names[g]
            if name in excl:
                continue
            if name not in groups:
                groups[name] = obj.vertex_groups.new(name=name)
            groups[name].add([v.index], gw / norm, "REPLACE")
    obj["skinned"] = True


def weight_rigid(obj: bpy.types.Object, bone: str) -> None:
    obj.vertex_groups.clear()
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj["skinned"] = True


# --------------------------------------------------------------------------- limb frames


def arm_frame(j: Joints, p: Vector):
    """(side, s from shoulder joint in m, arm length, axis, radial) for a point."""
    side = 1 if p.x >= 0 else -1
    a = Vector((j.arm_l.x * side, j.arm_l.y, j.arm_l.z))
    w = Vector((j.wrist_l.x * side, j.wrist_l.y, j.wrist_l.z))
    d = w - a
    length = d.length
    d.normalize()
    s = (p - a).dot(d)
    return side, s, length, d, (p - a) - d * s


def leg_frame(j: Joints, p: Vector):
    """(side, s from hip joint down in m, leg length, angle around the leg)."""
    side = 1 if p.x >= 0 else -1
    hip = Vector((j.hip_l.x * side, j.hip_l.y, j.hip_l.z))
    ank = Vector((j.ankle_l.x * side, j.ankle_l.y, j.ankle_l.z))
    d = ank - hip
    length = d.length
    d.normalize()
    s = (p - hip).dot(d)
    r = (p - hip) - d * s
    ang = math.atan2(r.x * side, -r.y)  # 0 = front, + = outer side
    return side, s, length, ang


def in_arm(j: Joints, p: Vector) -> bool:
    side, s, length, d, radial = arm_frame(j, p)
    return s > -0.01 * j.H and radial.length < 0.07 * j.H and abs(p.x) > j.arm_l.x * 0.72


def wrinkles(j: Joints, p: Vector, *, arm: float = 0.0, leg: float = 0.0, waist: float = 0.0, seed: float = 0.0) -> float:
    """Fold ridges (metres, along the normal): zig-zag bands inside the elbow
    and knee, bunching above the cuffs and ankles, and a few soft horizontal
    folds where a jacket gathers at the waist."""
    H = j.H
    out = 0.0
    if arm and in_arm(j, p):
        side, s, length, d, radial = arm_frame(j, p)
        rn = radial.normalized() if radial.length > 1e-6 else Vector((0, 0, 1))
        ang = math.atan2(rn.y, rn.z * side)
        u = s / length
        elbow = math.exp(-(((u - 0.54) / 0.13) ** 2))
        cuff = smoothstep(0.7, 0.93, u)
        wave = math.sin(s / (0.026 * H) * 2 * math.pi + ang * 1.6 + seed)
        zig = math.sin(s / (0.019 * H) * 2 * math.pi - ang * 2.1 + seed * 1.7)
        out += arm * 0.0055 * H * (elbow * max(0.0, wave) ** 1.5 + cuff * max(0.0, zig) ** 2)
    if leg and abs(p.x) > 0.008 * H and p.z < j.hip_l.z:
        side, s, length, ang = leg_frame(j, p)
        u = s / length
        if 0 < u < 1.05:
            knee = math.exp(-(((u - 0.5) / 0.1) ** 2)) * (0.5 + 0.5 * math.cos(ang))
            hem = smoothstep(0.72, 0.98, u)
            wave = math.sin(s / (0.03 * H) * 2 * math.pi + ang * 1.3 + seed)
            out += leg * 0.006 * H * (knee * max(0.0, wave) ** 1.5 + hem * max(0.0, math.sin(s / (0.022 * H) * 2 * math.pi - ang * 1.8 + seed)) ** 2)
    if waist and abs(p.x) < 0.14 * H and not in_arm(j, p):
        k = math.exp(-(((p.z - j.waist.z) / (0.05 * H)) ** 2))
        ang = math.atan2(p.x, -p.y)
        out += waist * 0.004 * H * k * max(0.0, math.sin((p.z - j.waist.z) / (0.022 * H) * 2 * math.pi + ang * 2.0 + seed)) ** 2
    return out


# --------------------------------------------------------------------------- shells


Pred = Callable[[ZoneContext], bool]


def shell(
    name: str,
    j: Joints,
    keep: Pred,
    offset: float,
    mat=None,
    *,
    cuts: Iterable[tuple[Vector, Vector]] = (),
    thickness: float = 0.0035,
    extra: Callable[[Vector, Vector], float] | None = None,
    rules=None,
    materials=None,
    default: str | None = None,
    subdivide: int = 0,
    smooth_edge: bool = True,
    lip: bool = True,
) -> bpy.types.Object:
    """A garment cut from the body: keep the faces `keep` accepts (after
    bisecting along `cuts`), lift them `offset` (fraction of H) along the
    normal plus `extra(p, n)` metres, and give them `thickness` (fraction of
    H). Colour by `mat`, or by zone `rules` over `materials`.

    With `lip` (default) only the garment's edges get thickness — the
    boundary is turned under like a hem — instead of a full inner layer:
    half the triangles, and the inside is never seen over the body."""
    H = j.H
    src = j.body
    me = src.data.copy()
    obj = _link(name, me)
    obj.matrix_world = src.matrix_world.copy()
    # The body's baked anatomy shading doesn't belong on the cloth.
    for ca in list(me.color_attributes):
        me.color_attributes.remove(ca)
    # Vertex groups (skin weights) come with a copied object; copy them over.
    for g in src.vertex_groups:
        obj.vertex_groups.new(name=g.name)
    bm = bmesh.new()
    bm.from_mesh(me)
    for co, no in cuts:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    bm.normal_update()
    kill = [f for f in bm.faces if not keep(ZoneContext(j, f.calc_center_median(), f.normal.copy()))]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(me)
    bm.free()
    if subdivide:
        sub = obj.modifiers.new("Sub", "SUBSURF")
        sub.levels = subdivide
        sub.boundary_smooth = "PRESERVE_CORNERS" if not smooth_edge else "ALL"
        _apply(obj, sub)
    me.update()
    # Lift off the body (normals of the trimmed piece).
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    lifted = []
    for v in bm.verts:
        n = v.normal.copy()
        e = extra(v.co.copy(), n) if extra else 0.0
        lifted.append(v.co + n * (offset * H + e))
    for v, p in zip(bm.verts, lifted):
        v.co = p
    if lip and thickness > 0:
        bm.normal_update()
        edges = [e for e in bm.edges if e.is_boundary]
        key = lambda co: (round(co.x, 6), round(co.y, 6), round(co.z, 6))  # noqa: E731
        inward = {key(v.co): -v.normal.copy() for e in edges for v in e.verts}
        res = bmesh.ops.extrude_edge_only(bm, edges=edges)
        # Each new vertex starts on its source: tuck it under the hem.
        for v in (g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)):
            n = inward.get(key(v.co))
            if n is not None:
                v.co = v.co + n * thickness * H
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if thickness > 0 and not lip:
        sol = obj.modifiers.new("Sol", "SOLIDIFY")
        sol.thickness = thickness * H
        sol.offset = -1.0
        sol.use_even_offset = True
        sol.use_rim = True
        _apply(obj, sol)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.clear()
    if rules is not None:
        zone(obj, j, rules, materials, default)
    else:
        me.materials.append(mat)
        for p in me.polygons:
            p.material_index = 0
    obj["skinned"] = True
    return obj


def flare_near(j: Joints, plane_co: Vector, plane_no: Vector, reach: float, amount: float) -> Callable[[Vector, Vector], float]:
    """Extra lift growing towards a hem plane (on its kept side): hems stand off."""
    no = plane_no.normalized()

    def f(p: Vector, n: Vector) -> float:
        d = abs((p - plane_co).dot(no))
        return amount * j.H * (1 - smoothstep(0, reach * j.H, d)) ** 2

    return f


# --------------------------------------------------------------------------- shoes


def shoe(
    name: str,
    j: Joints,
    side: int,
    mat_upper,
    mat_sole,
    *,
    length: float = 1.18,
    width: float = 1.0,
    height: float = 1.0,
    sole: float = 0.012,
    toe_up: float = 0.004,
    collar: float = 0.075,
    mat_toe=None,
    mat_collar=None,
    stripe=None,
) -> bpy.types.Object:
    """A shoe lofted heel → toe from rounded cross-sections: a flat sole slab
    (its own material), a rounded toe box rising slightly, a throat that
    dips over the instep, and a collar around the ankle. Weighted to the
    foot and toe bones like the body underneath."""
    H = j.H
    heel = Vector((j.heel_l.x, j.heel_l.y + 0.006 * H, 0.0))
    toe = Vector((j.toe_l.x, j.toe_l.y, 0.0))
    fwd = (toe - heel)
    fwd.z = 0
    base_len = fwd.length
    fwd.normalize()
    L = base_len * length
    start = heel - fwd * base_len * (length - 1) * 0.25
    lat = Vector((1, 0, 0))
    stations = 14
    ring = 16
    bm = bmesh.new()
    rows = []
    for i in range(stations + 1):
        t = i / stations
        # Half-width: narrow heel, broad ball, rounded toe.
        w = (0.026 + 0.012 * math.sin(math.pi * min(1.0, t * 1.25)) ** 0.8) * H * width
        if t > 0.82:
            w *= math.sqrt(max(0.0, 1 - ((t - 0.82) / 0.18) ** 2)) * 0.55 + 0.45 * (1 - (t - 0.82) / 0.18)
        if t < 0.06:
            w *= 0.75 + 0.25 * t / 0.06
        # Top line: collar at the heel, throat dips, toe box slopes down.
        top = (collar * (1 - smoothstep(0.0, 0.42, t)) + 0.046 * smoothstep(0.0, 0.42, t) * (1 - smoothstep(0.42, 1.0, t)) + 0.03 * smoothstep(0.62, 1.0, t)) * H * height
        if t > 0.9:
            top *= 1 - 0.65 * ((t - 0.9) / 0.1) ** 1.5
        bottom = toe_up * H * smoothstep(0.78, 1.0, t)
        c = start + fwd * L * t
        row = []
        for k in range(ring):
            a = 2 * math.pi * k / ring
            ca, sa = math.cos(a), math.sin(a)
            # Superellipse: flat-ish sole, rounded upper.
            ex = 2.8 if sa < 0 else 2.2
            x = math.copysign(abs(ca) ** (2 / ex), ca) * w
            zf = math.copysign(abs(sa) ** (2 / ex), sa)
            z = bottom + (top - bottom) * (0.5 + 0.5 * zf)
            if sa < 0:
                z = bottom + (top - bottom) * 0.5 * (1 + zf) * 0.35 + bottom * 0
                z = max(bottom, z)
            p = c + lat * x + Vector((0, 0, z))
            row.append(bm.verts.new(p))
        rows.append(row)
    for i in range(stations):
        for k in range(ring):
            bm.faces.new((rows[i][k], rows[i][(k + 1) % ring], rows[i + 1][(k + 1) % ring], rows[i + 1][k]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    # Flatten the very bottom onto the ground plane.
    for row in rows:
        for v in row:
            if v.co.z < 0.0015 * H:
                v.co.z = 0.0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if side < 0:
        for v in bm.verts:
            v.co.x = -v.co.x
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(name, me)
    sub = obj.modifiers.new("Sub", "SUBSURF")
    sub.levels = 1
    _apply(obj, sub)
    for p in me.polygons:
        p.use_smooth = True
    mats = [mat_upper, mat_sole] + ([mat_toe] if mat_toe else []) + ([mat_collar] if mat_collar else []) + ([stripe[0]] if stripe else [])
    for m in mats:
        me.materials.append(m)
    toe_i = 2 if mat_toe else None
    col_i = (3 if mat_toe else 2) if mat_collar else None
    str_i = len(mats) - 1 if stripe else None
    for p in me.polygons:
        c = p.center
        t = (Vector((abs(c.x), c.y, 0)) - Vector((abs(start.x), start.y, 0))).dot(fwd) / L
        if c.z < sole * H:
            p.material_index = 1
        elif toe_i is not None and t > 0.8 and p.normal.z > -0.2:
            p.material_index = toe_i
        elif col_i is not None and t < 0.32 and c.z > (collar - 0.014) * H * height:
            p.material_index = col_i
        elif str_i is not None and stripe[1](t, c, p.normal):
            p.material_index = str_i
    skin_like_body(obj, j)
    return obj


# --------------------------------------------------------------------------- trims and studs


def ribbon(name: str, pts: list[Vector], normals: list[Vector], width: float, mat, thickness: float = 0.0025, closed: bool = False) -> bpy.types.Object:
    """A flat band along a polyline lying on a surface (normals = surface normals)."""
    bm = bmesh.new()
    rows = []
    n = len(pts)
    for i, p in enumerate(pts):
        tan = (pts[(i + 1) % n] - pts[i - 1]) if closed else (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        tan.normalize()
        side = tan.cross(normals[i]).normalized()
        rows.append((bm.verts.new(p - side * width * 0.5), bm.verts.new(p + side * width * 0.5)))
    for i in range(n if closed else n - 1):
        a, b = rows[i], rows[(i + 1) % n]
        bm.faces.new((a[0], a[1], b[1], b[0]))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    # Face the band outward.
    if bm.faces and bm.faces[0].normal.dot(normals[0]) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(name, me)
    if thickness > 0:
        sol = obj.modifiers.new("Sol", "SOLIDIFY")
        sol.thickness = thickness
        sol.offset = 1.0
        sol.use_rim = True
        _apply(obj, sol)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    return obj


def trim(name: str, j: Joints, path: list[tuple[Vector, Vector]], width: float, mat, lift: float = 0.0, thickness: float = 0.0025, closed: bool = False) -> bpy.types.Object | None:
    """Band following the body surface. `path` is a list of (origin, direction)
    rays cast onto the body; `lift` (fraction of H) floats it over a shell."""
    pts, nrm = [], []
    for o, d in path:
        hit = surface_point(j, o, d, lift * j.H)
        if hit is None:
            continue
        pts.append(hit[0])
        nrm.append(hit[1])
    if len(pts) < 2:
        return None
    obj = ribbon(name, pts, nrm, width * j.H, mat, thickness=thickness, closed=closed)
    skin_like_body(obj, j)
    return obj


def vertical_trim(name: str, j: Joints, x: float, z0: float, z1: float, width: float, mat, lift: float = 0.0, side: float = -1.0, steps: int = 24) -> bpy.types.Object | None:
    """A band running up the front (or back) of the torso at lateral x."""
    path = []
    for i in range(steps + 1):
        z = z0 + (z1 - z0) * i / steps
        path.append((Vector((x, side * 1.0, z)), Vector((0, -side, 0))))
    return trim(name, j, path, width, mat, lift=lift)


def ring_trim(name: str, j: Joints, centre: Vector, axis: Vector, width: float, mat, lift: float = 0.0, steps: int = 40) -> bpy.types.Object | None:
    """A closed band around a limb or the waist: rays cast outward from
    `centre` (inside the limb) in the plane normal to `axis`, so they find
    that limb's own surface and never a neighbour's."""
    axis = axis.normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    a = axis.cross(ref).normalized()
    b = axis.cross(a).normalized()
    pts, nrm = [], []
    for i in range(steps):
        ang = 2 * math.pi * i / steps
        r = a * math.cos(ang) + b * math.sin(ang)
        hit = surface_point(j, centre, r, lift * j.H)
        if hit is None:
            continue
        pts.append(hit[0])
        nrm.append(hit[1])
    if len(pts) < 3:
        return None
    obj = ribbon(name, pts, nrm, width * j.H, mat, closed=True)
    skin_like_body(obj, j)
    return obj


def studs(name: str, j: Joints, points: list[tuple[Vector, Vector]], radius: float, mat, lift: float = 0.0, flat: float = 0.4, segments: int = 8) -> bpy.types.Object | None:
    """Buttons / rivets / eyelets: flattened domes placed by ray onto the body."""
    bm = bmesh.new()
    any_ = False
    for o, d in points:
        hit = surface_point(j, o, d, lift * j.H)
        if hit is None:
            continue
        any_ = True
        p, n = hit
        res = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=max(4, segments // 2), radius=radius * j.H)
        q = Vector((0, 0, 1)).rotation_difference(n)
        m = Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((1, 1, flat, 1))
        bmesh.ops.transform(bm, matrix=m, verts=res["verts"])
    if not any_:
        bm.free()
        return None
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(name, me)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    skin_like_body(obj, j)
    return obj


def plate(name: str, j: Joints, origin: Vector, direction: Vector, size: tuple[float, float, float], mat, lift: float = 0.0, spin: float = 0.0, bevel: float = 0.25) -> bpy.types.Object | None:
    """A small rounded block on the surface (buckle, zip pull, logo patch)."""
    hit = surface_point(j, origin, direction, lift * j.H)
    if hit is None:
        return None
    p, n = hit
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((size[0] * j.H, size[1] * j.H, size[2] * j.H)), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(name, me)
    if bevel > 0:
        bv = obj.modifiers.new("Bevel", "BEVEL")
        bv.width = min(size) * j.H * bevel
        bv.segments = 2
        _apply(obj, bv)
    q = Vector((0, 0, 1)).rotation_difference(n)
    obj.data.transform(Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Rotation(spin, 4, "Z"))
    me.materials.append(mat)
    skin_like_body(obj, j)
    return obj


def glyph(name: str, j: Joints, origin: Vector, direction: Vector, strokes: list[tuple[tuple[float, float], tuple[float, float]]], size: float, stroke: float, mat, lift: float = 0.0) -> bpy.types.Object | None:
    """A raised letter/emblem from straight strokes in a unit square (x right,
    y up), placed on the surface — e.g. the 'N' on Subaru's tracksuit."""
    hit = surface_point(j, origin, direction, lift * j.H)
    if hit is None:
        return None
    p, n = hit
    up = Vector((0, 0, 1))
    right = up.cross(n).normalized() * -1  # character's left → viewer's right on the front
    up = n.cross(right).normalized() * -1
    bm = bmesh.new()
    S = size * j.H
    w = stroke * j.H
    for (x0, y0), (x1, y1) in strokes:
        a = p + right * (x0 - 0.5) * S + up * (y0 - 0.5) * S
        b = p + right * (x1 - 0.5) * S + up * (y1 - 0.5) * S
        d = (b - a).normalized()
        s = d.cross(n).normalized() * w * 0.5
        ext = d * w * 0.5
        vs = [bm.verts.new(a - ext - s), bm.verts.new(b + ext - s), bm.verts.new(b + ext + s), bm.verts.new(a - ext + s)]
        f = bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(n) < 0:
            f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(name, me)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.0015
    sol.offset = 1.0
    _apply(obj, sol)
    me.materials.append(mat)
    skin_like_body(obj, j)
    return obj


# --------------------------------------------------------------------------- hood, scarf


def tube_along(bm, pts: list[Vector], radii: list[tuple[float, float]], ups: list[Vector], ring: int = 12, cap: bool = True):
    """Elliptical tube along pts; radii are (across, up) per point."""
    rows = []
    n = len(pts)
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        up = (ups[i] - tan * ups[i].dot(tan)).normalized()
        across = tan.cross(up).normalized()
        rows.append([bm.verts.new(p + across * math.cos(2 * math.pi * k / ring) * radii[i][0] + up * math.sin(2 * math.pi * k / ring) * radii[i][1]) for k in range(ring)])
    for i in range(n - 1):
        for k in range(ring):
            bm.faces.new((rows[i][k], rows[i][(k + 1) % ring], rows[i + 1][(k + 1) % ring], rows[i + 1][k]))
    if cap:
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
    return rows


def hood_down(name: str, j: Joints, mat, mat_lining=None, size: float = 1.0, over=None, skin: bool = True, span: float = 84.0, rim_folds: float = 0.0, soft: bool = False) -> bpy.types.Object:
    """A hood worn down: a thick rolled rim around the back of the neck from
    collarbone to collarbone, and the deflated hood lying on the upper back
    in a few soft folds, ending in a blunt point between the shoulder blades.
    `span`: how far round the rim reaches each way (degrees from the back);
    `rim_folds` swells and pinches the rim like gathered cloth; `soft` gives
    the deflated hood real cloth thickness, a fuller bulge and a rolled edge."""
    from outfit import drape_down

    H = j.H
    parts = []
    # Rolled rim: around the neck, from front-left over the back to front-right.
    pts, radii, ups = [], [], []
    n_rim = 13 if not rim_folds else 25
    for i in range(n_rim):
        a = math.radians(-span + 2 * span * i / (n_rim - 1))  # 0 = straight back
        x = math.sin(a) * 0.066 * H * size
        y = j.neck_base.y + math.cos(a) * 0.058 * H * size
        p = drape_down(j, x, y, 0.022 * H) or Vector((x, y, j.neck_base.z - 0.02 * H))
        back = math.cos(a)
        p.z += 0.004 * H * max(0.0, back)
        p.y += 0.006 * H * max(0.0, back)
        pts.append(p)
        r = (0.009 + 0.01 * max(0.0, back) ** 0.7) * H * size
        if rim_folds:
            r *= 1 + rim_folds * math.sin(9 * a + 0.6)
            # Ends taper off into the cloak rather than stopping as a bar.
            r *= 0.45 + 0.55 * min(1.0, (span - abs(math.degrees(a))) / 22)
        radii.append((r, r * 0.8))
        ups.append(Vector((math.sin(a), math.cos(a), 0.6)).normalized())
    bm = bmesh.new()
    tube_along(bm, pts, radii, ups, ring=10)
    me = bpy.data.meshes.new(name + "_rim")
    bm.to_mesh(me)
    bm.free()
    rim = _link(name + "_rim", me)
    parts.append(rim)
    # Deflated hood: a tapered, flattened sack draped down the upper back
    # (over the cloak when there is one).
    if over is not None:
        dg = bpy.context.evaluated_depsgraph_get()
        tree = BVHTree.FromObject(over, dg)
    else:
        tree = body_mesh_bvh(j)
    bm = bmesh.new()
    cols, rows_n = 14, 12
    grid = []
    top_z = j.neck_base.z - 0.005 * H
    for r in range(rows_n + 1):
        t = r / rows_n
        z = top_z - 0.17 * H * size * t
        half = 0.085 * H * size * (1 - 0.82 * t ** 1.4)
        row = []
        for c in range(cols + 1):
            u = c / cols - 0.5
            x = u * 2 * half
            fold = 0.006 * H * math.sin(u * 3 * math.pi + t * 2.0) * (0.4 + t)
            hit = tree.ray_cast(Vector((x, 1.0, z)), Vector((0, -1, 0)))
            y = hit[0].y if hit[0] is not None else j.chest.y + 0.08 * H
            bulge = 0.018 * H * size * math.cos(u * math.pi) * (1 - t) ** 0.6 * (0.6 + 0.4 * math.sin(math.pi * min(1.0, t * 1.4)))
            if soft:
                bulge *= 1.35
                fold *= 1.4
            row.append(bm.verts.new(Vector((x, y + 0.006 * H + bulge + fold, z))))
        grid.append(row)
    for r in range(rows_n):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    grid_pts = [[v.co.copy() for v in row] for row in grid]
    me = bpy.data.meshes.new(name + "_sack")
    bm.to_mesh(me)
    bm.free()
    sack = _link(name + "_sack", me)
    sol = sack.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = (0.011 if soft else 0.006) * H
    sol.use_rim = True
    _apply(sack, sol)
    parts.append(sack)
    if soft:
        # A rolled edge down its sides and round its point: cloth, not plate.
        bm = bmesh.new()
        outline = [grid_pts[r][0] for r in range(rows_n + 1)] + [grid_pts[rows_n][c] for c in range(1, cols + 1)] + [grid_pts[r][cols] for r in range(rows_n - 1, -1, -1)]
        ups = [Vector((0, 1, 0))] * len(outline)
        tube_along(bm, [q + Vector((0, 0.004 * H, 0)) for q in outline], [(0.0065 * H, 0.0055 * H)] * len(outline), ups, ring=8)
        me = bpy.data.meshes.new(name + "_edge")
        bm.to_mesh(me)
        bm.free()
        parts.append(_link(name + "_edge", me))
    for o in parts:
        for p in o.data.polygons:
            p.use_smooth = True
        o.data.materials.append(mat)
    obj = _join(parts, name)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    if skin:
        skin_like_body(obj, j)
    return obj


def scarf(name: str, j: Joints, mat, puff: float = 1.0, tails: Iterable[tuple[float, float, float]] = ()):
    """A thick scarf wound round the neck, with hanging tails. `tails` are
    (azimuth deg (0 = front, + = character's left), length fraction of H,
    width fraction of H). Returns (wrap, tails mesh or None, chain guides):
    the wrap is skinned like the neck, the tails swing on spring chains."""
    H = j.H
    bm = bmesh.new()
    for layer, (dz, rr) in enumerate(((-0.012, 1.12), (0.006, 0.98))):
        pts, radii, ups = [], [], []
        for i in range(33):
            a = 2 * math.pi * i / 32
            x = math.sin(a) * 0.05 * H * rr
            y = j.neck_base.y - math.cos(a) * 0.047 * H * rr
            z = j.neck_base.z + dz * H + 0.006 * H * math.cos(a)
            pts.append(Vector((x, y, z)))
            r = 0.0135 * H * puff * (1 + 0.14 * math.sin(a * 3 + layer * 1.7))
            radii.append((r * 0.8, r))
            ups.append(Vector((0, 0, 1)))
        tube_along(bm, pts[:-1] + [pts[0]], radii[:-1] + [radii[0]], ups, ring=10, cap=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    wrap = _link(name, me)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    skin_like_body(wrap, j)
    guides = {}
    tail_objs = []
    for ti, (az, length, width) in enumerate(tails):
        a = math.radians(az)
        front = math.cos(a) > 0
        start = Vector((math.sin(a) * 0.046 * H, j.neck_base.y - math.cos(a) * 0.056 * H, j.neck_base.z - 0.016 * H))
        line = [start]
        steps = 10
        for s_ in range(1, steps + 1):
            t = s_ / steps
            x = start.x + math.sin(a) * 0.01 * H * t + 0.006 * H * math.sin(t * 3.0 + ti)
            z = start.z - length * H * t
            hit = front_point(j, x, z, 0.02 * H, side=-1.0 if front else 1.0)
            y = hit[0].y if hit else start.y
            line.append(Vector((x, y, z)))
        bmt = bmesh.new()
        rows = []
        for s_, p in enumerate(line):
            t = s_ / steps
            w = width * H * (0.8 + 0.3 * t)
            twist = 0.25 * math.sin(t * 2.4 + ti)
            off = Vector((math.cos(twist) * w / 2, math.sin(twist) * w / 2, 0))
            rows.append((bmt.verts.new(p - off), bmt.verts.new(p + off)))
        for s_ in range(steps):
            bmt.faces.new((rows[s_][0], rows[s_][1], rows[s_ + 1][1], rows[s_ + 1][0]))
        me = bpy.data.meshes.new(f"{name}_tail{ti}")
        bmt.to_mesh(me)
        bmt.free()
        to = _link(f"{name}_tail{ti}", me)
        sol = to.modifiers.new("Sol", "SOLIDIFY")
        sol.thickness = 0.007 * H
        sol.use_rim = True
        _apply(to, sol)
        for p in to.data.polygons:
            p.use_smooth = True
        to.data.materials.append(mat)
        tail_objs.append(to)
        guides[f"scarf{ti}"] = [line[0], line[len(line) // 2], line[-1]]
    tails_obj = _join(tail_objs, name + "_tails") if tail_objs else None
    if tails_obj is not None:
        tails_obj["bone"] = "upperChest"
    return wrap, tails_obj, guides


def _join(objs, name):
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


# --------------------------------------------------------------------------- robes, sandals


def tatter_hem(obj: bpy.types.Object, j: Joints, top_z: float, length: float, amount: float, teeth: int = 22, seed: float = 0.0) -> None:
    """Rip a hem into ragged points: vertices in the lowest fifth of a
    skirt/cloak are pulled up by a jagged, uneven saw-tooth around it."""
    H = j.H
    bottom = top_z - length
    for v in obj.data.vertices:
        p = v.co
        k = 1 - (p.z - bottom) / max(1e-6, length * 0.22)
        if k <= 0:
            continue
        a = math.atan2(p.x, p.y)
        f = (a / (2 * math.pi) * teeth + seed) % 1.0
        tri = abs(2 * f - 1)
        vary = 0.55 + 0.45 * math.sin(a * 3.7 + seed * 5.1) * math.cos(a * 1.9 - seed)
        p.z += amount * H * tri * vary * min(1.0, k)


def sandal(name: str, j: Joints, side: int, mat_sole, mat_strap, *, length: float = 1.22, width: float = 1.1, thickness: float = 0.014) -> bpy.types.Object:
    """A zori: a flat oval sole under the bare foot and a V-shaped thong
    strap from between the toes back to either side of the arch."""
    H = j.H
    heel = Vector((j.heel_l.x, j.heel_l.y + 0.012 * H, 0.0))
    toe = Vector((j.toe_l.x, j.toe_l.y - 0.01 * H, 0.0))
    fwd = toe - heel
    L0 = fwd.length
    fwd.normalize()
    L = L0 * length
    start = heel - fwd * (L - L0) * 0.3
    lat = Vector((1, 0, 0))
    bm = bmesh.new()
    ring = []
    n = 28
    for i in range(n):
        a = 2 * math.pi * i / n
        t = 0.5 - 0.5 * math.cos(a)  # 0 heel .. 1 toe
        w = (0.024 + 0.008 * math.sin(math.pi * min(1.0, t * 1.15))) * H * width
        x = math.sin(a) * w * (1 - 0.25 * (1 - t) ** 3)
        ring.append(start + fwd * L * t + lat * x)
    bot = [bm.verts.new(p) for p in ring]
    top = [bm.verts.new(p + Vector((0, 0, thickness * H))) for p in ring]
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    for i in range(n):
        k = (i + 1) % n
        bm.faces.new((bot[i], bot[k], top[k], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    sole = _link(name, me)
    bv = sole.modifiers.new("Bevel", "BEVEL")
    bv.width = thickness * H * 0.3
    bv.segments = 2
    _apply(sole, bv)
    sole.data.materials.append(mat_sole)
    parts = [sole]
    # Thong: from between the big toe and the next, over the instep, to the sides.
    if side < 0:
        for o in parts:
            o.data.transform(Matrix.Scale(-1, 4, Vector((1, 0, 0))))
            o.data.flip_normals()
        start = Vector((-start.x, start.y, start.z))
        lat = Vector((-1, 0, 0))
    post = start + fwd * L * 0.8 + lat * (-0.006 * H)
    for s in (-1, 1):
        path = []
        for i in range(9):
            t = i / 8
            q = post.lerp(start + fwd * L * 0.46 + lat * s * 0.026 * H, t)
            path.append((Vector((q.x, q.y, 0.06 * H)), Vector((0, 0, -1))))
        st = trim(f"{name}_strap{s}", j, path, 0.009, mat_strap, lift=0.004, thickness=0.004)
        if st is not None:
            st.vertex_groups.clear()
            parts.append(st)
    obj = _join(parts, name)
    skin_like_body(obj, j)
    return obj


# --------------------------------------------------------------------------- bows, frills


def bow(name: str, centre: Vector, forward: Vector, size: float, mat, *, tails: float = 1.0, droop: float = 0.25, knot_mat=None) -> bpy.types.Object:
    """A ribbon bow: two flattened loops either side of a knot and two tails
    hanging down at angles. `forward` points out of the surface it sits on;
    `size` is the half-span in metres."""
    f = forward.normalized()
    up = Vector((0, 0, 1))
    side = up.cross(f)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    up = f.cross(side).normalized()
    parts = []
    for s in (1, -1):
        # A cupped lobe: the loop seen face-on, pinched at the knot.
        n = 20
        bm = bmesh.new()
        lobe_c = centre + side * s * size * 0.55 - up * droop * size * 0.35
        hub = bm.verts.new(lobe_c - f * size * 0.08)
        ring_v = []
        for i in range(n):
            a = 2 * math.pi * i / n
            r = 0.5 + 0.5 * math.cos(a)  # 1 at the outer end, 0 at the knot
            lx = s * (size * 0.08 + size * 0.95 * r)
            ly = size * 0.42 * math.sin(a) * (0.35 + 0.65 * r) - droop * size * r * r
            ring_v.append(bm.verts.new(centre + side * lx + up * ly + f * size * 0.05 * r))
        for i in range(n):
            bm.faces.new((hub, ring_v[i], ring_v[(i + 1) % n]))
        me = bpy.data.meshes.new(f"{name}_loop{s}")
        bm.to_mesh(me)
        bm.free()
        o = _link(f"{name}_loop{s}", me)
        sol = o.modifiers.new("Sol", "SOLIDIFY")
        sol.thickness = size * 0.06
        sol.use_rim = True
        _apply(o, sol)
        o.data.materials.append(mat)
        parts.append(o)
        if tails > 0:
            bm = bmesh.new()
            rows = []
            steps = 6
            for i in range(steps + 1):
                t = i / steps
                c = centre + side * s * size * (0.15 + 0.45 * t) - up * size * (0.25 + 1.3 * tails * t) + f * size * 0.1 * math.sin(t * 3)
                w = size * (0.32 - 0.05 * t)
                rows.append((bm.verts.new(c - side * w * 0.5 * s * 0.3 - f * w * 0.1), bm.verts.new(c + side * w * 0.5)))
            for i in range(steps):
                a, b = rows[i], rows[i + 1]
                bm.faces.new((a[0], a[1], b[1], b[0]))
            me = bpy.data.meshes.new(f"{name}_tail{s}")
            bm.to_mesh(me)
            bm.free()
            o = _link(f"{name}_tail{s}", me)
            sol = o.modifiers.new("Sol", "SOLIDIFY")
            sol.thickness = size * 0.05
            sol.use_rim = True
            _apply(o, sol)
            o.data.materials.append(mat)
            parts.append(o)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
    for v in bm.verts:
        v.co = centre + side * v.co.x * size * 0.2 + up * v.co.y * size * 0.24 + f * (v.co.z * size * 0.14 + size * 0.06)
    me = bpy.data.meshes.new(f"{name}_knot")
    bm.to_mesh(me)
    bm.free()
    o = _link(f"{name}_knot", me)
    o.data.materials.append(knot_mat or mat)
    parts.append(o)
    out = _join(parts, name)
    bm = bmesh.new()
    bm.from_mesh(out.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(out.data)
    bm.free()
    for p in out.data.polygons:
        p.use_smooth = True
    return out


def frill_ring(name: str, centre: Vector, axis: Vector, radius: float, depth: float, mat, waves: int = 18, flare: float = 0.5, segments: int = 72) -> bpy.types.Object:
    """A ruffled lace ring (cuffs, hems): a short band that flares outward
    along `axis` with a wavy edge."""
    axis = axis.normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    bm = bmesh.new()
    rows = []
    for zi in range(3):
        k = zi / 2
        row = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            wave = math.sin(a * waves)
            r = radius * (1 + flare * k * (0.8 + 0.2 * wave)) + depth * 0.12 * wave * k
            d = u * math.cos(a) + v * math.sin(a)
            row.append(bm.verts.new(centre + d * r + axis * depth * k * (1 - 0.15 * wave)))
        rows.append(row)
    for zi in range(2):
        for i in range(segments):
            bm.faces.new((rows[zi][i], rows[zi][(i + 1) % segments], rows[zi + 1][(i + 1) % segments], rows[zi + 1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = _link(name, me)
    sol = o.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = depth * 0.06
    sol.use_rim = True
    _apply(o, sol)
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.append(mat)
    return o

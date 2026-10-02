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
from mathutils.bvhtree import BVHTree

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


def body_bvh(j: Joints) -> BVHTree:
    """BVH of the (rest-pose) body for draping garments onto it."""
    cached = getattr(j, "_bvh", None)
    if cached is not None:
        return cached
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(j.body, dg)
    j._bvh = tree
    return tree


def drape_down(j: Joints, x: float, y: float, offset: float) -> Vector | None:
    """Drop a point onto the body from above (collars, shoulder capes)."""
    hit = body_bvh(j).ray_cast(Vector((x, y, j.head_top.z + 0.05 * j.H)), Vector((0, 0, -1)))
    if hit[0] is None:
        return None
    loc, nrm = hit[0], hit[1]
    return loc + nrm * offset


def push_outside_torso(j: Joints, p: Vector, offset: float, torso_half_x: float) -> Vector:
    """Push a point radially out of the torso (ignores arm hits)."""
    radial = Vector((p.x, p.y - j.neck_base.y, 0))
    if radial.length < 1e-6:
        return p
    d = radial.normalized()
    origin = Vector((d.x * 2.0, j.neck_base.y + d.y * 2.0, p.z))
    hit = body_bvh(j).ray_cast(origin, -d)
    if hit[0] is None or abs(hit[0].x) > torso_half_x:
        return p
    surface_r = Vector((hit[0].x, hit[0].y - j.neck_base.y, 0)).length
    if radial.length < surface_r + offset:
        q = Vector((d.x * (surface_r + offset), j.neck_base.y + d.y * (surface_r + offset), p.z))
        return q
    return p


def _finish(name: str, bm: bmesh.types.BMesh, mat, thickness: float, smooth: bool = True) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if thickness > 0:
        sol = obj.modifiers.new("Sol", "SOLIDIFY")
        sol.thickness = thickness
        sol.offset = 1.0
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=sol.name)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    obj.data.materials.append(mat)
    return obj


def shoulder_collar(
    name: str,
    j: Joints,
    mat,
    outer_x: float,
    outer_front: float,
    outer_back: float,
    frill_waves: int = 0,
    frill_amp: float = 0.0,
    flare: float = 0.012,
    rings: int = 6,
    segments: int = 64,
    thickness: float = 0.004,
    open_front: float = 0.0,
    slope: float = 0.5,
    lift: float = 0.0,
    slope_back: float | None = None,
) -> bpy.types.Object:
    """A collar that lies on the shoulders and chest (sailor collar, maid
    neckline frill, capelet): an annulus around the neck dropped onto the
    body, with its outer edge lifted into a flare or ruffle."""
    H = j.H
    bm = bmesh.new()
    grid = []
    rx_in, ry_in = 0.043 * H, 0.041 * H
    off = (0.005 + lift) * H
    for r in range(rings + 1):
        t = r / rings
        row = []
        for i in range(segments + (1 if open_front else 0)):
            if open_front:
                a = open_front / 2 + (2 * math.pi - open_front) * i / segments
            else:
                a = 2 * math.pi * i / segments  # 0 = front (-y)
            fb = (1 + math.cos(a)) / 2
            ry_out = (outer_back + (outer_front - outer_back) * fb) * H
            rx = rx_in + (outer_x * H - rx_in) * t
            ry = ry_in + (ry_out - ry_in) * t
            x = math.sin(a) * rx
            y = j.neck_base.y - math.cos(a) * ry
            # Stiff fabric: the collar follows a shallow cone out from the
            # neck and only rests on the body where the body rises above it
            # (the shoulders); elsewhere it flares free instead of sliding
            # down the chest, back or the A-posed arms.
            radial_d = math.hypot(x, y - j.neck_base.y)
            # A heavier fabric can fall more steeply behind than in front.
            sl = slope if slope_back is None else slope_back + (slope - slope_back) * fb
            cone_z = j.neck_base.z - 0.006 * H + lift * H - sl * max(0.0, radial_d - rx_in)
            p = drape_down(j, x, y, off + 0.002 * H * t)
            if p is None or p.z < cone_z:
                p = Vector((x, y, cone_z))
            if t > 0.5:
                # Edge stands off the body a little: fabric has body.
                k = (t - 0.5) / 0.5
                radial = Vector((math.sin(a), -math.cos(a), 0))
                wave = 0.5 + 0.5 * math.sin(frill_waves * a) if frill_waves else 1.0
                p = p + radial * (flare * H * k * k + frill_amp * H * k * wave) + Vector((0, 0, -0.4 * frill_amp * H * k * wave))
            row.append(bm.verts.new(p))
        grid.append(row)
    n = len(grid[0])
    for r in range(rings):
        for i in range(n if not open_front else n - 1):
            a0, a1 = grid[r][i], grid[r][(i + 1) % n]
            b0, b1 = grid[r + 1][i], grid[r + 1][(i + 1) % n]
            bm.faces.new((a0, a1, b1, b0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _finish(name, bm, mat, thickness * H / 1.7)
    return obj


def cape(
    name: str,
    j: Joints,
    width: float,
    length: float,
    mat,
    tatters: float = 0.0,
    chains: int = 4,
    bones: int = 4,
    wrap: float = 128.0,
    folds: int = 5,
    fold_depth: float = 0.012,
    flare: float = 0.35,
    fold2: tuple[int, float] | None = None,
    hem_curve: float = 0.0,
    edge_wave: float = 0.0,
    thickness: float = 0.005,
    edges_out: dict | None = None,
) -> tuple[bpy.types.Object, list[list[Vector]]]:
    """Cloak fastened at the neck: drapes over the shoulders (dropped onto
    the body), then hangs down the back with folds and flare. `width` is
    the half-width at the shoulders as a fraction of H; `length` is measured
    from the shoulders down. `edges_out`, if given, receives the free edges'
    points ("left", "right", "hem")."""
    H = j.H
    bm = bmesh.new()
    # Enough columns that every fold is a rounded ridge, not a zig-zag.
    cols, rows = max(26, folds * 6), 20
    drape_rows = 5
    shoulder_rx = width * H
    shoulder_ry = 0.085 * H
    wrap_r = math.radians(wrap)
    grid = []
    rim = []
    torso_x = 0.13 * H
    for c in range(cols + 1):
        u = c / cols - 0.5
        a = math.pi + u * wrap_r  # pi = straight back
        # --- draped part: neck → shoulder rim
        col = []
        for r in range(drape_rows + 1):
            k = r / drape_rows
            rx = 0.046 * H + (shoulder_rx - 0.046 * H) * k
            ry = 0.044 * H + (shoulder_ry - 0.044 * H) * k
            x = math.sin(a) * rx
            y = j.neck_base.y - math.cos(a) * ry
            radial_d = math.hypot(x, y - j.neck_base.y)
            cone_z = j.neck_base.z - 0.006 * H - 0.8 * max(0.0, radial_d - 0.046 * H)
            p = drape_down(j, x, y, 0.007 * H)
            if p is None or p.z < cone_z:
                p = Vector((x, y, cone_z))
            col.append(p)
        rim.append(col[-1])
        grid.append(col)
    # --- hanging part
    rim_z = min(p.z for p in rim)
    for c in range(cols + 1):
        u = c / cols - 0.5
        a = math.pi + u * wrap_r
        top = rim[c]
        radial = Vector((math.sin(a), -math.cos(a), 0))
        for r in range(1, rows - drape_rows + 1):
            t = r / (rows - drape_rows)
            z = top.z + (rim_z - top.z) * min(1.0, t * 4) - length * H * t
            # Folds fall from the shoulders and deepen towards the hem.
            fold = fold_depth * H * math.sin(u * folds * 2 * math.pi) * min(1.0, t * 1.5) * (0.6 + 0.4 * t)
            if fold2:
                # Finer folds between the big ones, lower down.
                fold += fold2[1] * H * math.sin(u * fold2[0] * 2 * math.pi + 1.3) * t
            out = flare * 0.12 * H * t + fold
            p = Vector((top.x, top.y, z)) + radial * out
            if hem_curve:
                # Hangs longest at the back; the front corners ride higher.
                p.z += hem_curve * H * t * (abs(u) * 2) ** 2
            if edge_wave:
                # The free front edges ripple instead of falling ruler-straight.
                k = max(0.0, (abs(u) - 0.4) / 0.1)
                tangent = Vector((math.cos(a), math.sin(a), 0)) * (1 if u > 0 else -1)
                p += tangent * edge_wave * H * k * math.sin(t * 3.2 * math.pi) * t
            if r == rows - drape_rows:
                # The hem rides up a little over each fold's crest.
                p.z += 0.35 * max(0.0, fold)
            if tatters > 0 and r == rows - drape_rows:
                p.z += tatters * H * 0.045 * (0.5 + 0.5 * math.sin(c * 2.7) * math.cos(c * 1.3))
            p = push_outside_torso(j, p, 0.012 * H, torso_x)
            grid[c].append(p)
    if edges_out is not None:
        # The free edges (front edges top to bottom, the hem), for trims.
        edges_out["left"] = [p.copy() for p in grid[0]]
        edges_out["right"] = [p.copy() for p in grid[cols]]
        edges_out["hem"] = [grid[c][-1].copy() for c in range(cols + 1)]
    verts = [[bm.verts.new(p) for p in col] for col in grid]
    for c in range(cols):
        for r in range(len(verts[c]) - 1):
            bm.faces.new((verts[c][r], verts[c + 1][r], verts[c + 1][r + 1], verts[c][r + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _finish(name, bm, mat, thickness)
    guides = []
    for ci in range(chains):
        c = round((ci + 0.5) / chains * cols)
        col = grid[c]
        line = []
        for b in range(bones + 1):
            t = b / bones
            idx = drape_rows + round(t * (len(col) - 1 - drape_rows))
            line.append(col[idx].copy())
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

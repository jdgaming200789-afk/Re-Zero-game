"""Anime hair from swept clumps.

A clump is grown from a root on the scalp: it starts along a given
direction, gradually yields to gravity (stiffness), may curl, and is kept
outside the head ellipsoid. The path is swept with a lens-shaped cross
section that tapers to a point — the classic anime "hair spike".

Long clumps can be bound to spring-bone chains (hair_<chain>_<i>) that the
engine simulates; everything else is rigidly weighted to the head bone.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import bpy  # noqa: F401
import bmesh
from mathutils import Matrix, Vector

from humanoid import Joints


@dataclass
class Clump:
    az: float  # degrees around the head, 0 = front, +90 = character's left
    el: float  # degrees above the head's equator
    direction: tuple[float, float, float]  # initial direction in head space (x left, y back, z up)
    length: float  # fraction of head height
    width: float = 0.16  # fraction of head height
    thickness: float = 0.045
    stiffness: float = 0.6  # 0 falls immediately, 1 keeps its direction
    gravity: float = 1.0
    curl: float = 0.0  # radians per unit length around the growth axis
    lift: float = 0.0  # extra push away from the head
    tip: float = 1.4  # taper exponent
    hold: float = 0.45  # fraction of the length kept at full width before tapering
    chain: str | None = None
    twist: float = 0.0
    root_offset: float = 0.012
    tip_material: int = 0  # material slot for the tip (0 = same as root)
    tip_start: float = 0.8
    # A named part the game can show and hide (hair under a hood): clumps
    # with a part are split into their own mesh, `<id>_part_<part>`.
    part: str | None = None


@dataclass
class Drill:
    """Ringlet / drill curl (Beatrice's twin tails)."""
    side: int  # +1 left, -1 right
    top: tuple[float, float, float]  # attachment point in head-local units (x, y, z) * head height
    length: float
    radius: float
    turns: float
    tube: float
    chain: str | None = None
    tip_material: int = 0
    tip_start: float = 0.78


@dataclass
class HairStyle:
    clumps: list[Clump] = field(default_factory=list)
    drills: list[Drill] = field(default_factory=list)
    hairline_front: float = 0.36
    cap_offset: float = 0.014
    chains: dict[str, int] = field(default_factory=dict)  # chain -> bone count


class HeadFrame:
    def __init__(self, j: Joints, width: float, depth: float):
        self.c = j.head_center
        self.H = j.head_h
        self.rw = self.H * 0.5 * width
        self.rd = self.H * 0.5 * depth * 1.06
        self.rh = self.H * 0.5

    def surface(self, az: float, el: float, offset: float) -> Vector:
        a = math.radians(az)
        e = math.radians(el)
        n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        p = Vector((n.x * self.rw, n.y * self.rd, n.z * self.rh))
        return self.c + p + p.normalized() * offset * self.H

    def inside(self, p: Vector, margin: float) -> tuple[bool, Vector]:
        d = p - self.c
        k = (d.x / (self.rw + margin)) ** 2 + (d.y / (self.rd + margin)) ** 2 + (d.z / (self.rh + margin)) ** 2
        if k < 1.0:
            push = Vector((d.x / self.rw**2, d.y / self.rd**2, d.z / self.rh**2)).normalized()
            return True, push
        return False, Vector()


def grow_path(frame: HeadFrame, c: Clump, steps: int | None = None) -> list[Vector]:
    H = frame.H
    if steps is None:
        # Short locks need fewer rings; long, curling ones keep their curve.
        steps = max(8, min(18, int(round(c.length * 9 + abs(c.curl) * 2))))
    p = frame.surface(c.az, c.el, c.root_offset)
    d = Vector(c.direction).normalized()
    seg = c.length * H / steps
    pts = [p.copy()]
    axis_up = Vector((0, 0, 1))
    for i in range(steps):
        t = (i + 1) / steps
        # Gravity takes over as stiffness is exhausted.
        g = (1 - c.stiffness) * c.gravity * t * 1.6
        d = (d + Vector((0, 0, -1)) * g * 0.35).normalized()
        if c.curl:
            rot = Matrix.Rotation(c.curl * seg / H, 3, axis_up.cross(d).normalized() if abs(d.z) < 0.98 else Vector((1, 0, 0)))
            d = (rot @ d).normalized()
        p = p + d * seg
        hit, push = frame.inside(p, (0.02 + c.lift) * H)
        if hit:
            p = p + push * 0.02 * H
            d = (d + push * 0.6).normalized()
        pts.append(p.copy())
    return pts


def sweep(bm: bmesh.types.BMesh, pts: list[Vector], frame: HeadFrame, c: Clump, uv_layer, ring: int = 6, faces_out: list | None = None):
    """Sweep a lens cross-section along the path. Returns created verts with
    their path parameter (and appends the created faces to `faces_out`)."""
    H = frame.H
    n = len(pts)
    rows = []
    created = []
    for i, p in enumerate(pts):
        t = i / (n - 1)
        tan = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        out = (p - frame.c).normalized()
        wide = tan.cross(out)
        if wide.length < 1e-4:
            wide = Vector((1, 0, 0))
        wide.normalize()
        if c.twist:
            wide = (Matrix.Rotation(c.twist * t, 3, tan) @ wide).normalized()
        thick = wide.cross(tan).normalized()
        # Anime locks keep their width (even swell a little) and then taper
        # to a point: a leaf shape, not a triangle.
        u = max(0.0, (t - c.hold) / max(1e-4, 1 - c.hold))
        taper = (1 - u**c.tip) ** 0.85 if t < 0.999 else 0.0
        w = c.width * H * 0.5 * max(taper, 0.02) * (0.82 + 0.26 * math.sin(math.pi * min(1.0, t * 1.25)))
        th = c.thickness * H * 0.5 * max(taper, 0.05)
        row = []
        for k in range(ring):
            phi = 2 * math.pi * k / ring
            # Lens: wide flat top, thin edges.
            off = wide * math.cos(phi) * w + thick * math.sin(phi) * th
            v = bm.verts.new(p + off)
            row.append(v)
            created.append((v, t))
        rows.append(row)
    for i in range(n - 1):
        for k in range(ring):
            a = rows[i][k]
            b = rows[i][(k + 1) % ring]
            cc = rows[i + 1][(k + 1) % ring]
            d = rows[i + 1][k]
            f = bm.faces.new((a, b, cc, d))
            if faces_out is not None:
                faces_out.append(f)
            if c.tip_material and (i + 0.5) / (n - 1) > c.tip_start:
                f.material_index = c.tip_material
            for loop in f.loops:
                vi = rows[i].index(loop.vert) if loop.vert in rows[i] else rows[i + 1].index(loop.vert)
                row_i = i if loop.vert in rows[i] else i + 1
                loop[uv_layer].uv = (vi / ring, row_i / (n - 1))
    # Close the root end
    root = bm.faces.new(list(reversed(rows[0])))
    if faces_out is not None:
        faces_out.append(root)
    return created


def helix_drill(bm, frame: HeadFrame, d: Drill, uv_layer, steps: int = 96, ring: int = 10):
    """Drill curl as a wound ribbon: a flat band spiralling down a narrowing
    cone, each turn overlapping the one below — the classic ojou-sama
    ringlet silhouette of stacked tiers."""
    H = frame.H
    top = frame.c + Vector(d.top) * H
    created = []
    rows = []
    pitch = d.length * H / max(0.5, d.turns)
    for i in range(steps + 1):
        t = i / steps
        ang = t * d.turns * 2 * math.pi * d.side
        # Cone: fuller in the middle, tight at the tip.
        r = d.radius * H * (0.75 + 0.45 * math.sin(math.pi * min(1.0, t * 1.15))) * (1 - 0.55 * t * t)
        centre = top + Vector((0, 0, -d.length * H * t))
        radial = Vector((math.cos(ang), math.sin(ang), 0))
        p = centre + radial * r
        tangent = Vector((-math.sin(ang) * d.side, math.cos(ang) * d.side, 0))
        up = Vector((0, 0, 1))
        # Band: tall along the axis (overlaps the tier below), thin radially.
        band = pitch * (0.62 + 0.25 * (1 - t)) * min(1.0, 0.25 + t * 6)
        thick = d.tube * H * 0.32 * (1 - 0.5 * t) * min(1.0, 0.4 + t * 5)
        row = []
        for k in range(ring):
            phi = 2 * math.pi * k / ring
            # Lens: flattened against the cone, bulging outward, drooping.
            off = up * math.sin(phi) * band * 0.5 + radial * math.cos(phi) * thick - up * band * 0.18
            # Lower edge flares out so tiers read as layered.
            if math.sin(phi) < 0:
                off += radial * (-math.sin(phi)) * thick * 0.9
            v = bm.verts.new(p + off)
            row.append(v)
            created.append((v, t))
        rows.append(row)
    _ = tangent
    for i in range(steps):
        for k in range(ring):
            f = bm.faces.new((rows[i][k], rows[i][(k + 1) % ring], rows[i + 1][(k + 1) % ring], rows[i + 1][k]))
            if d.tip_material and i / steps > d.tip_start:
                f.material_index = d.tip_material
            for loop in f.loops:
                loop[uv_layer].uv = (k / ring, i / steps)
    bm.faces.new(list(reversed(rows[0])))
    tipf = bm.faces.new(rows[-1])
    if d.tip_material:
        tipf.material_index = d.tip_material
    return created


def hairline_z(az_deg: float, front: float) -> float:
    """Normalised height of the hairline at an azimuth (0 = forehead)."""
    az = abs(az_deg)
    s1 = min(1.0, max(0.0, az / 65.0))
    s2 = min(1.0, max(0.0, (az - 85.0) / 70.0))
    s1 = s1 * s1 * (3 - 2 * s1)
    s2 = s2 * s2 * (3 - 2 * s2)
    return front - 0.3 * s1 - 0.62 * s2


def hairline_keep(frame: HeadFrame, p: Vector, front: float) -> bool:
    d = p - frame.c
    nx, ny, nz = d.x / frame.rw, d.y / frame.rd, d.z / frame.rh
    az = math.degrees(math.atan2(nx, -ny))
    return nz > hairline_z(az, front)


def build_cap(name: str, head_spec, frame: HeadFrame, style: HairStyle) -> bpy.types.Object:
    """Scalp shell: a high-resolution copy of the sculpted head, offset
    outward and trimmed to the hairline (fine steps, no stair-stepping)."""
    from head import sculpt

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=44, radius=1.0)
    rd = frame.H * 0.5 * head_spec.depth
    for v in bm.verts:
        q = sculpt(v.co.copy(), head_spec)
        v.co = Vector((frame.c.x + q.x * frame.rw, frame.c.y + q.y * rd, frame.c.z + q.z * frame.rh))
    bm.normal_update()
    kill = [f for f in bm.faces if not hairline_keep(frame, f.calc_center_median(), style.hairline_front)]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    # Snap the ragged boundary onto the hairline curve (no stair-steps).
    boundary = {v for e in bm.edges if len(e.link_faces) == 1 for v in e.verts}
    for v in boundary:
        d = v.co - frame.c
        az = math.degrees(math.atan2(d.x / frame.rw, -d.y / rd))
        v.co.z = frame.c.z + hairline_z(az, style.hairline_front) * frame.rh
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * style.cap_offset * frame.H
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    return obj


def build_hair(name: str, j: Joints, head_obj, head_spec, style: HairStyle) -> tuple[bpy.types.Object, dict[str, list]]:
    frame = HeadFrame(j, head_spec.width, head_spec.depth)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    # chain id -> list of (vertex, t)
    bound: dict[str, list] = {}
    chain_paths: dict[str, list[Vector]] = {}
    # Face layer: which part (1-based index into `parts`) a face belongs to.
    parts = sorted({c.part for c in style.clumps if c.part})
    part_layer = bm.faces.layers.int.new("part") if parts else None
    for c in style.clumps:
        pts = grow_path(frame, c)
        faces: list = []
        created = sweep(bm, pts, frame, c, uv, faces_out=faces)
        if c.part and part_layer is not None:
            k = parts.index(c.part) + 1
            for f in faces:
                f[part_layer] = k
        if c.chain:
            bound.setdefault(c.chain, []).extend(created)
            chain_paths.setdefault(c.chain, pts)
    for d in style.drills:
        created = helix_drill(bm, frame, d, uv)
        if d.chain:
            bound.setdefault(d.chain, []).extend(created)
            top = frame.c + Vector(d.top) * frame.H
            chain_paths.setdefault(d.chain, [top, top + Vector((0, 0, -d.length * frame.H))])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # BMVerts die with the bmesh; keep stable indices (mesh order == bm order).
    bm.verts.index_update()
    bound_idx = {k: [(v.index, t) for v, t in lst] for k, lst in bound.items()}
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    # Placeholder slots so the join keeps per-face material indices (dyed
    # tips use slot 1); build.py swaps in the real materials afterwards.
    slot0 = bpy.data.materials.get("_hair_slot0") or bpy.data.materials.new("_hair_slot0")
    slot1 = bpy.data.materials.get("_hair_slot1") or bpy.data.materials.new("_hair_slot1")
    me.materials.append(slot0)
    me.materials.append(slot1)
    cap = build_cap(name + "_cap", head_spec, frame, style)
    cap.data.materials.append(slot0)
    # Join cap into hair (keeps vertex indices of clumps stable: cap appended after)
    n_clump_verts = len(me.vertices)
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    cap.select_set(True)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj, {"chains": chain_paths, "bound": bound_idx, "clump_vertex_count": n_clump_verts, "parts": parts}

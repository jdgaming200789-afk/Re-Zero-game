"""Emilia's two thin front cloth panels, fitted to the completed torso.

The pattern lives in front X/Z coordinates. Its long descending edges and
curved central opening come from the supplied no-cloak and opening frames.
Depth comes from the body's actual surface and a downward drape envelope,
not cup geometry, added breast volume, edge puff, or a tubular border.
"""
from __future__ import annotations

import math

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform, delaunay_2d_cdt

import accessories as acc
import tailor as t
from torso_contours import CubicCurve, fade


THICKNESS = 0.00085  # H, about 1.4 mm at Emilia's height
EASE = 0.0022       # mid-surface clearance at supported points

# Cubic Bezier segments (start, controls, end), in front projection H units.
# The lower outline descends toward the outer tip instead of circling an
# ellipsoidal lower pole. Small changes of direction make broad soft scallops.
PATTERN = (
    ((0.000, 0.829), (0.014, 0.830), (0.026, 0.829), (0.031, 0.826), "top"),
    ((0.031, 0.826), (0.049, 0.824), (0.065, 0.809), (0.073, 0.794), "top"),
    ((0.073, 0.794), (0.076, 0.781), (0.080, 0.765), (0.078, 0.748), "outer"),
    ((0.078, 0.748), (0.080, 0.729), (0.074, 0.709), (0.067, 0.696), "outer"),
    ((0.067, 0.696), (0.065, 0.670), (0.080, 0.642), (0.095, 0.627), "outer"),
    ((0.034, 0.697), (0.029, 0.708), (0.010, 0.731), (0.013, 0.748), "opening"),
)
SEAM = (
    ((0.013, 0.748), (0.004, 0.749), (-0.017, 0.756), (-0.015, 0.771), "seam"),
    ((-0.015, 0.771), (-0.017, 0.785), (-0.012, 0.796), (0.000, 0.804), "seam"),
    ((0.000, 0.804), (0.000, 0.812), (0.000, 0.821), (0.000, 0.829), "seam"),
)


def bezier(segment, u):
    p0, p1, p2, p3 = segment[:4]
    weights = ((1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3)
    return tuple(sum(w * p[k] for w, p in zip(weights, (p0, p1, p2, p3))) for k in (0, 1))


def outline(side):
    points = []
    for segment in PATTERN:
        if segment[4] == "opening":
            # Interpolate the traced lower contour with continuous curvature.
            # Independent Bezier scallops create sharp tangent changes at
            # their joins; these broad lobes have no faceted cusps.
            zs = (0.627, 0.636, 0.647, 0.656, 0.670, 0.680, 0.688, 0.697)
            curve = CubicCurve(zs, (0.095, 0.069, 0.064, 0.053, 0.049, 0.040, 0.037, 0.034))
            for k in range(75):
                z = zs[0] + (zs[-1] - zs[0]) * k / 75
                zz = z + (0.0012 * math.sin(math.pi * fade(0.627, 0.748, z)) if side < 0 else 0)
                points.append((side * curve(z), zz, "hem"))
        if segment[4] == "opening":
            # Traced from the close-up and front frame: the exposed purple
            # stays narrow above the lower return, then broadens smoothly.
            # One broad diagonal Bezier widened it too early at mid-height.
            zs = (0.697, 0.707, 0.716, 0.726, 0.739, 0.748)
            curve = CubicCurve(zs, (0.034, 0.025, 0.018, 0.013, 0.0127, 0.013))
            for k in range(48):
                z = zs[0] + (zs[-1] - zs[0]) * k / 48
                zz = z + (0.0012 * math.sin(math.pi * fade(0.627, 0.748, z)) if side < 0 else 0)
                points.append((side * curve(z), zz, "opening"))
            continue
        length = sum(math.dist(a, b) for a, b in zip(segment[:3], segment[1:4]))
        for k in range(max(4, math.ceil(length / 0.0018))):
            x, z = bezier(segment, k / max(4, math.ceil(length / 0.0018)))
            # Slightly different free hems, without changing either support.
            if side < 0 and segment[4] in ("hem", "opening"):
                z += 0.0012 * math.sin(math.pi * fade(0.627, 0.748, z))
            points.append((side * x, z, segment[4]))
    if side < 0:
        # The left panel forms the soft top of the purple opening. The
        # other panel laps over it at the end of the curved upper seam.
        bridge = ((-0.013, 0.748), (-0.002, 0.7474), (0.006, 0.7476), (0.013, 0.748), "opening")
        points.extend((*bezier(bridge, k / 14), "opening") for k in range(14))
    for segment in SEAM:
        for k in range(20):
            x, z = bezier(segment, k / 20)
            points.append((x + (-0.0006 if side > 0 else 0.0006), z, "seam"))
    # Root sits under the collar; keep the two halves overlapped there too.
    points[0] = (-0.0006 if side > 0 else 0.0006, points[0][1], points[0][2])
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))
    if area < 0:
        points.reverse()
    return points


def inside(points, x, z):
    hit = False
    for a, b in zip(points, points[1:] + points[:1]):
        if (a[1] > z) != (b[1] > z) and x < a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]):
            hit = not hit
    return hit


def drape_field(j):
    """Downward cloth envelope, supported by the existing upper/outer torso.

    Rays measure real body depth. Below a support the cloth returns toward
    the body with a bounded slope, so it falls off the lower pole instead of
    acquiring a padded rim. Outside the torso the same field continues the
    free hanging cloth. This changes spacing, never thickness or body volume.
    """
    step = 0.00125
    xs = [i * step for i in range(81)]
    zs = [0.625 + i * step for i in range(169)]
    rows = []
    for z in zs:
        row = []
        last = -0.022 * j.H
        for x in xs:
            hit = t.front_point(j, x * j.H, z * j.H)
            if hit is not None:
                last = hit[0].y
            else:
                last += step * j.H * 0.45
            row.append(last)
        rows.append(row)
    contact = [row[:] for row in rows]
    for k in range(len(zs) - 2, -1, -1):
        for i, x in enumerate(xs):
            if zs[k] < 0.752:
                slope = 0.34 + 0.10 * fade(0.055, 0.080, x)
                rows[k][i] = min(rows[k][i], rows[k + 1][i] + step * j.H * slope)
    # Fair the depth field as a thin sheet. This smooths the contact-to-free
    # transition and the extrapolated outer hems without adding a rim or puff.
    # A tensioned sheet bridges small triangulation/axillary hollows. The
    # body is an obstacle, not a pointwise imprint on the cloth: constrained
    # fairing leaves supported points in contact and smooths the free spans.
    for _ in range(64):
        smooth = [row[:] for row in rows]
        for k in range(1, len(zs) - 1):
            for i in range(1, len(xs) - 1):
                average = 0.5 * rows[k][i] + 0.125 * (rows[k - 1][i] + rows[k + 1][i] + rows[k][i - 1] + rows[k][i + 1])
                smooth[k][i] = min(contact[k][i], average)
        rows = smooth

    def sample(x, z):
        fi = min(len(xs) - 1.001, max(0.0, abs(x) / step))
        fk = min(len(zs) - 1.001, max(0.0, (z - zs[0]) / step))
        i, k = int(fi), int(fk)
        a, b = fi - i, fk - k
        return ((1 - a) * rows[k][i] + a * rows[k][i + 1]) * (1 - b) + ((1 - a) * rows[k + 1][i] + a * rows[k + 1][i + 1]) * b

    return sample


def copy_surface_weights(obj, j):
    """Barycentric weights from the actual fitting triangle, including hems."""
    body = j.body
    body.data.calc_loop_triangles()
    triangles = [tuple(tri.vertices) for tri in body.data.loop_triangles]
    tree = BVHTree.FromPolygons([v.co.copy() for v in body.data.vertices], triangles, all_triangles=True)
    names = [g.name for g in body.vertex_groups]
    weights = [{g.group: g.weight for g in v.groups} for v in body.data.vertices]
    groups = {i: obj.vertex_groups.new(name=name) for i, name in enumerate(names)}
    for vertex in obj.data.vertices:
        p, _, face, _ = tree.find_nearest(vertex.co)
        if p is None:
            continue
        ids = triangles[face]
        a, b, c = (body.data.vertices[i].co for i in ids)
        bary = barycentric_transform(p, a, b, c, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        factors = [max(0.0, float(v)) for v in bary]
        total = sum(factors) or 1.0
        combined = {}
        for i, factor in zip(ids, factors):
            for group, weight in weights[i].items():
                combined[group] = combined.get(group, 0.0) + factor / total * weight
        norm = sum(combined.values()) or 1.0
        for group, weight in combined.items():
            if weight > 1e-5:
                groups[group].add([vertex.index], weight / norm, "REPLACE")
    obj["skinned"] = True


def chest_panels(name, j, mat):
    field = drape_field(j)
    body_tree = t.body_mesh_bvh(j)
    seam_points = [bezier(segment, k / 20) for segment in SEAM for k in range(20)] + [(0, 0.829)]
    seam_points.sort(key=lambda p: p[1])
    seam_x = CubicCurve([p[1] for p in seam_points], [p[0] for p in seam_points])
    parts = []
    for side in (1, -1):
        boundary = outline(side)
        points = [Vector((x, z)) for x, z, _ in boundary]
        step = 0.0025
        for xi in range(-40, 41):
            for zi in range(1, 81):
                x, z = xi * step, 0.625 + zi * step
                if inside(boundary, x, z):
                    points.append(Vector((x, z)))
        vertices, _, triangles, *_ = delaunay_2d_cdt(points, [], [list(range(len(boundary)))], 1, 1e-8)
        bm = bmesh.new()
        verts = []
        for point in vertices:
            x, z = point
            lap = THICKNESS + 0.00015 if side > 0 and 0.748 <= z <= 0.829 else 0.0
            lap *= 1 - fade(0.001, 0.015, x - seam_x(z))
            p = Vector((x * j.H, field(x, z) - (EASE + lap) * j.H, z * j.H))
            q, normal, _, _ = body_tree.find_nearest(p)
            if q is not None:
                clearance = (p - q).dot(normal)
                if clearance < EASE * j.H:
                    if normal.y < -0.1:
                        # Preserve the drawn X/Z contour. Normal projection
                        # along coarse triangles would shift alternating hem
                        # vertices vertically and serrate an otherwise smooth
                        # edge. Front depth supplies the required clearance.
                        p.y -= (EASE * j.H - clearance) / -normal.y
                    elif clearance < (THICKNESS * 0.5 + 0.0003) * j.H:
                        p += normal * ((THICKNESS * 0.5 + 0.0003) * j.H - clearance)
            verts.append(bm.verts.new(p))
        for tri in triangles:
            bm.faces.new([verts[i] for i in tri])
        # Refine contact curvature where interpolation between fitted
        # corners approaches the body. The cloth stays at its original
        # thickness/ease instead of hiding intersections with extra bulk.
        for _ in range(3):
            edges = set()
            for face in bm.faces:
                p = face.calc_center_median()
                q, normal, _, _ = body_tree.find_nearest(p)
                if q is not None and (p - q).dot(normal) < (THICKNESS * 0.5 + 0.0007) * j.H:
                    edges.update(face.edges)
            if not edges:
                break
            bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=1, use_grid_fill=True)
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
            for vertex in bm.verts:
                p = vertex.co
                q, normal, _, _ = body_tree.find_nearest(p)
                if q is not None:
                    gap = (p - q).dot(normal)
                    if gap < EASE * j.H and normal.y < -0.1:
                        p.y -= (EASE * j.H - gap) / -normal.y
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if sum(f.normal.y for f in bm.faces) > 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        obj = acc._obj(f"{name}_{'left' if side > 0 else 'right'}", bm, mat)
        sol = obj.modifiers.new("Cloth thickness", "SOLIDIFY")
        sol.thickness = THICKNESS * j.H
        sol.offset = 0
        obj.data.materials.append(mat)
        sol.material_offset_rim = 1
        t._apply(obj, sol)
        for face in obj.data.polygons:
            if face.material_index == 1:
                face.use_smooth = False
        parts.append(obj)
    obj = acc.join(parts, name)
    obj["separate"] = True
    obj["panel_count"] = 2
    obj["cloth_thickness_m"] = THICKNESS * j.H
    copy_surface_weights(obj, j)
    return obj

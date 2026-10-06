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

# Independent front-image traces, in supplied IMG_1592 pixel coordinates.
# Normalize between neck foot y=245 and navel y=451. These are approximate
# garment edge observations, not a radial outline derived from the torso.
FRONT_ORIGIN_X = 276
FRONT_NECK_Y = 245
FRONT_PIXELS_PER_H = 899
FRONT_TRACES = {
    1: {
        "outer": ((304, 248), (329, 268), (339, 294), (343, 325),
                  (341, 352), (340, 372), (347, 400), (364, 429)),
        "inner": ((364, 429), (343, 421), (328, 407), (319, 398),
                  (317, 386), (311, 380), (308, 365), (299, 353),
                  (292, 342), (288, 330), (288, 318)),
    },
    -1: {
        "outer": ((248, 248), (220, 267), (211, 294), (209, 324),
                  (213, 350), (216, 370), (208, 399), (190, 429)),
        "inner": ((190, 429), (212, 419), (226, 407), (235, 398),
                  (239, 387), (245, 381), (247, 364), (255, 354),
                  (262, 343), (265, 330), (264, 318)),
    },
}


def from_front_pixel(point):
    x, y = point
    return (x - FRONT_ORIGIN_X) / FRONT_PIXELS_PER_H, 0.829 - (y - FRONT_NECK_Y) / FRONT_PIXELS_PER_H


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
    """Two independent C2 outlines traced before any body fitting."""
    trace = FRONT_TRACES[side]
    outer = [from_front_pixel(p) for p in trace["outer"]]
    inner = [from_front_pixel(p) for p in trace["inner"]]
    points = []
    root = (-0.0006 if side > 0 else 0.0006, 0.829)
    top = (root, (side * 0.013, 0.831), (side * 0.024, 0.830), outer[0], "top")
    points.extend((*bezier(top, k / 20), "top") for k in range(20))
    for data, descending, tag in ((outer, True, "outer"), (inner, False, "opening")):
        rows = sorted(data, key=lambda p: p[1])
        curve = CubicCurve([p[1] for p in rows], [p[0] for p in rows])
        z0, z1 = (rows[-1][1], rows[0][1]) if descending else (rows[0][1], rows[-1][1])
        count = math.ceil(abs(z1 - z0) / 0.0012)
        for k in range(count):
            z = z0 + (z1 - z0) * k / count
            points.append((curve(z), z, "hem" if not descending and z < 0.698 else tag))
    # Join the traced opening to the shared soft upper lap without forcing
    # either lower half to be a mirror of the other.
    x0, z0 = inner[-1]
    seam_start = SEAM[0][0]
    if side < 0:
        bridge = ((x0, z0), (-0.004, z0 - 0.0007), (0.006, 0.7475), seam_start, "opening")
        points.extend((*bezier(bridge, k / 16), "opening") for k in range(16))
    else:
        points.append((x0, z0, "opening"))
    for segment in SEAM:
        for k in range(20):
            x, z = bezier(segment, k / 20)
            points.append((x + (-0.0006 if side > 0 else 0.0006), z, "seam"))
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
    """C2 hanging sheet supported by upper/outer torso, with body obstacles.

    A continuous depth loft releases below the support instead of using a
    row-wise minimum slope. That hard switch imprinted a horizontal cup-like
    band. Constrained bending fairing bridges hollows and keeps the free spans
    smooth. No thickness, puff, rim, or body displacement is added.
    """
    step = 0.00125
    xs = [i * step for i in range(81)]
    zs = [0.625 + i * step for i in range(169)]
    body, obstacles = [], []
    for z in zs:
        row, obstacle = [], []
        last = -0.022 * j.H
        for x in xs:
            hit = t.front_point(j, x * j.H, z * j.H)
            if hit is not None:
                last = hit[0].y
                obstacle.append(last)
            else:
                last += step * j.H * 0.45
                obstacle.append(None)
            row.append(last)
        body.append(row)
        obstacles.append(obstacle)

    def at_height(z, i):
        f = min(len(zs) - 1.001, max(0, (z - zs[0]) / step))
        k = int(f)
        return body[k][i] * (1 - (f - k)) + body[k + 1][i] * (f - k)

    columns = []
    for i, x in enumerate(xs):
        crest_rows = [k for k, z in enumerate(zs) if 0.715 <= z <= 0.745]
        crest = min(crest_rows, key=lambda k: body[k][i])
        support_z, support = zs[crest], body[crest][i]
        # The side frame shows cloth returning gently toward its lower edge.
        # These release landmarks govern slope/curvature, never panel outline.
        # The outer tips fall beside the torso in the running reference.
        # Applying the central return there pushed them behind the back and
        # produced fins. Keep the outer hanging span near its own support.
        release = 1 - fade(0.050, 0.080, x)
        heights = (0.625, 0.666, 0.695, support_z, 0.763, 0.788, 0.812, 0.835)
        depths = (support + 0.041 * j.H * release, support + 0.013 * j.H * release,
                  support + 0.002 * j.H * release, support,
                  at_height(0.763, i), at_height(0.788, i),
                  at_height(0.812, i), at_height(0.835, i))
        columns.append(CubicCurve(heights, depths))
    rest = [[columns[i](z) for i in range(len(xs))] for z in zs]
    rows = [[min(value, limit) if limit is not None else value
             for value, limit in zip(row, obstacle)]
            for row, obstacle in zip(rest, obstacles)]
    # Minimize thin-sheet bending energy, with a weak rest-shape anchor and
    # the torso as a unilateral obstacle. Membrane averaging alone leaves a
    # curvature band at lift-off. The biharmonic stencil fairs the slope and
    # curvature across that transition without inflating the contact surface.
    # Real body hits alone constrain cloth outside the silhouette.
    for _ in range(1000):
        smooth = [row[:] for row in rows]
        change = 0
        for k in range(2, len(zs) - 2):
            for i in range(2, len(xs) - 2):
                bending = (20 * rows[k][i]
                           - 8 * (rows[k - 1][i] + rows[k + 1][i] + rows[k][i - 1] + rows[k][i + 1])
                           + 2 * (rows[k - 1][i - 1] + rows[k - 1][i + 1]
                                  + rows[k + 1][i - 1] + rows[k + 1][i + 1])
                           + rows[k - 2][i] + rows[k + 2][i] + rows[k][i - 2] + rows[k][i + 2])
                value = rows[k][i] - 0.025 * (bending + 0.005 * (rows[k][i] - rest[k][i]))
                if obstacles[k][i] is not None:
                    value = min(obstacles[k][i], value)
                smooth[k][i] = value
                change = max(change, abs(value - rows[k][i]))
        rows = smooth
        if change < 1e-7 * j.H:
            break

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

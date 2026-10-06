"""Regular upper-torso loft with smooth bridges to preserved body regions.

The central Skin branch is removed, rather than displaced or wrapped. The
new surface comes from explicit front/oblique/side contour sections. The
waist, lower body, outer arms and upper neck retain their existing vertices.
"""
from __future__ import annotations

import math
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from torso_contours import CubicCurve, fade, silhouette_point


def loops_from_edges(edges):
    neighbors = {}
    for e in edges:
        for a, b in (e.verts, tuple(reversed(e.verts))):
            neighbors.setdefault(a, []).append(b)
    unused, loops = set(neighbors), []
    while unused:
        start = min(unused, key=lambda v: v.index)
        loop, previous, vertex = [], None, start
        while True:
            loop.append(vertex)
            unused.discard(vertex)
            choices = [v for v in neighbors[vertex] if v is not previous]
            if not choices:
                raise RuntimeError("Open contour boundary")
            following = choices[0]
            if following is start:
                break
            previous, vertex = vertex, following
            if len(loop) > len(neighbors):
                raise RuntimeError("Invalid contour boundary")
        loops.append(loop)
    return loops


def sort_polar(loop, angle):
    return sorted(loop, key=lambda v: angle(v.co) % (2 * math.pi))


def sample_loop(loop, angle, value, co=lambda v: v.co):
    rows = sorted(((angle(co(v)) % (2 * math.pi), co(v)) for v in loop), key=lambda p: p[0])
    value %= 2 * math.pi
    for i, (a, p) in enumerate(rows):
        b, q = rows[(i + 1) % len(rows)]
        if i == len(rows) - 1:
            b += 2 * math.pi
        u = value + (2 * math.pi if value < rows[0][0] else 0)
        if a <= u <= b:
            return p.lerp(q, (u - a) / (b - a))
    raise RuntimeError("Contour sampling failed")


def stitch(bm, a, b, angle=None):
    """Zipper two equally oriented closed loops, retaining all boundary verts."""
    if angle:
        a, b = sort_polar(a, angle), sort_polar(b, angle)
    n, m, i, j = len(a), len(b), 0, 0
    aa = [angle(v.co) % (2 * math.pi) for v in a] if angle else None
    ab = [angle(v.co) % (2 * math.pi) for v in b] if angle else None
    while i < n or j < m:
        ta = aa[(i + 1) % n] + (2 * math.pi if i + 1 >= n else 0) if angle else (i + 1) / n
        tb = ab[(j + 1) % m] + (2 * math.pi if j + 1 >= m else 0) if angle else (j + 1) / m
        if i >= n:
            ta = math.inf
        if j >= m:
            tb = math.inf
        if abs(ta - tb) < 1e-9:
            bm.faces.new((a[i % n], a[(i + 1) % n], b[(j + 1) % m], b[j % m]))
            i += 1
            j += 1
        elif ta < tb:
            bm.faces.new((a[i % n], a[(i + 1) % n], b[j % m]))
            i += 1
        else:
            bm.faces.new((a[i % n], b[(j + 1) % m], b[j % m]))
            j += 1


def rebuild_upper_torso(obj, profile, height):
    lower_z, upper_z, arm_x = 0.665, 0.849, 0.150
    original = BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices],
                                    [list(f.vertices) for f in obj.data.polygons])
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    # Cut only the upper central region. No planes cross the stable legs,
    # hips or waist. Intersections add vertices on the four graft boundaries.
    for point, normal in ((Vector((0, 0, lower_z * height)), Vector((0, 0, 1))),
                          (Vector((0, 0, upper_z * height)), Vector((0, 0, 1))),
                          (Vector((arm_x * height, 0, 0)), Vector((1, 0, 0))),
                          (Vector((-arm_x * height, 0, 0)), Vector((1, 0, 0)))):
        faces = [f for f in bm.faces if f.calc_center_median().z > 0.645 * height and abs(f.calc_center_median().x) < 0.180 * height]
        geom = set(faces)
        for f in faces:
            geom.update(f.edges)
            geom.update(f.verts)
        bmesh.ops.bisect_plane(bm, geom=list(geom), plane_co=point, plane_no=normal, dist=1e-7 * height)
    discard = [f for f in bm.faces if lower_z * height + 1e-7 < f.calc_center_median().z < upper_z * height - 1e-7
               and abs(f.calc_center_median().x) < arm_x * height - 1e-7]
    bmesh.ops.delete(bm, geom=discard, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    boundaries = loops_from_edges([e for e in bm.edges if e.is_boundary])
    if len(boundaries) != 4:
        raise RuntimeError(f"Expected four preserved graft loops, found {len(boundaries)}")
    centers = {i: sum((v.co for v in loop), Vector()) / len(loop) for i, loop in enumerate(boundaries)}
    bottom = boundaries[min(centers, key=lambda i: centers[i].z)]
    neck = boundaries[max(centers, key=lambda i: centers[i].z)]
    arms = {sign: boundaries[max(centers, key=lambda i: sign * centers[i].x)] for sign in (1, -1)}
    center_y = profile.center_y * height
    polar = lambda p: math.atan2(p.x, center_y - p.y)
    bottom, neck = sort_polar(bottom, polar), sort_polar(neck, polar)

    rows = profile.silhouette_rows + (
        (0.831, 0.0385, 0.0310, 0.0270, 0.0160, 0.0330),
        (0.849, 0.0310, 0.0300, 0.0260, 0.0150, 0.0320),
    )
    curves = tuple(CubicCurve([r[0] for r in rows], [r[k] for r in rows]) for k in range(1, 6))

    def retained(theta, z):
        origin = Vector((0, center_y, z * height))
        direction = Vector((math.sin(theta), -math.cos(theta), 0))
        hit = original.ray_cast(origin, direction)[0]
        if hit is None:
            raise RuntimeError("Cannot sample retained torso graft")
        return hit

    def point(theta, z):
        section = tuple(c(z) for c in curves)
        x, y = silhouette_point(theta, section)
        p = Vector((x * height, (y + profile.center_y) * height, z * height))
        # Follow the retained wall through the blend rather than grafting a
        # second radial parameterization onto it. Polar boundary registration
        # and its nearby surface trend agree on both position and tangent.
        if z < 0.691:
            old, at_cut = retained(theta, z), retained(theta, lower_z)
            cut = sample_loop(bottom, polar, theta)
            old.x += cut.x - at_cut.x
            old.y += cut.y - at_cut.y
            p = old.lerp(p, fade(lower_z, 0.691, z))
        # Join the retained upper neck without moving its cut ring.
        if z > 0.831:
            neck_angle = polar(p)
            old, at_cut = retained(neck_angle, z), retained(neck_angle, upper_z)
            cut = sample_loop(neck, polar, neck_angle)
            old.x += cut.x - at_cut.x
            old.y += cut.y - at_cut.y
            p = p.lerp(old, fade(0.831, upper_z, z))
        return p

    count, levels = 128, 128
    grid, parameters = [], {}
    for k in range(1, levels):
        z = lower_z + (upper_z - lower_z) * k / levels
        ring = []
        for i in range(count):
            theta = 2 * math.pi * i / count
            v = bm.verts.new(point(theta, z))
            ring.append(v)
            parameters[v] = (theta, z)
        grid.append(ring)
    hole_center, hole_height, hole_angle = 0.773, 0.037, 0.56

    def in_hole(theta, z):
        for center in (math.pi / 2, 3 * math.pi / 2):
            d = math.atan2(math.sin(theta - center), math.cos(theta - center))
            if (d / hole_angle) ** 2 + ((z - hole_center) / hole_height) ** 2 < 1:
                return True
        return False

    for k in range(len(grid) - 1):
        z = lower_z + (upper_z - lower_z) * (k + 1.5) / levels
        for i in range(count):
            theta = 2 * math.pi * (i + 0.5) / count
            if not in_hole(theta, z):
                bm.faces.new((grid[k][i], grid[k][(i + 1) % count], grid[k + 1][(i + 1) % count], grid[k + 1][i]))
    stitch(bm, bottom, grid[0], polar)
    stitch(bm, grid[-1], neck, polar)
    holes = loops_from_edges([e for e in bm.edges if e.is_boundary])
    fair = {}
    for v, (theta, z) in parameters.items():
        d = min(abs(math.atan2(math.sin(theta - center), math.cos(theta - center)))
                for center in (math.pi / 2, 3 * math.pi / 2))
        radius = math.sqrt((d / hole_angle) ** 2 + ((z - hole_center) / hole_height) ** 2)
        fair[v] = 1 - fade(1.05, 1.65, radius)
    # Two preserved arm loops and two new torso windows remain.
    for sign in (1, -1):
        arm = arms[sign]
        candidates = [loop for loop in holes if loop[0] in parameters
                      and sign * sum(v.co.x for v in loop) > 0]
        if len(candidates) != 1:
            raise RuntimeError("Cannot identify contour arm window")
        window = candidates[0]
        center = math.pi / 2 if sign > 0 else 3 * math.pi / 2
        for v in window:
            theta, z = parameters[v]
            d = math.atan2(math.sin(theta - center), math.cos(theta - center))
            t = math.atan2((z - hole_center) / hole_height, d / hole_angle)
            theta, z = center + hole_angle * math.cos(t), hole_center + hole_height * math.sin(t)
            v.co = point(theta, z)
            parameters[v] = (theta, z)
        ac = sum((v.co for v in arm), Vector()) / len(arm)
        wc = sum((v.co for v in window), Vector()) / len(window)
        # Angular ordering in the cut Y/Z plane matches both graft loops.
        plane_angle = lambda p: math.atan2(p.z - ac.z, p.y - ac.y)
        window_angle = lambda p: math.atan2(p.z - wc.z, p.y - wc.y)
        window = sort_polar(window, window_angle)
        arm = sort_polar(arm, plane_angle)
        end = [sample_loop(arm, plane_angle, window_angle(v.co)) for v in window]
        begin, tangent = [v.co.copy() for v in window], []
        for v, r in zip(window, end):
            theta, z = parameters[v]
            d = math.atan2(math.sin(theta - center), math.cos(theta - center))
            inward_theta, inward_z = -d, hole_center - z
            eps = 0.0001
            direction = (point(theta + inward_theta * eps, z + inward_z * eps) - v.co) / eps
            gap = (r - v.co).length
            direction = direction.normalized() * gap if direction.length else Vector((sign * gap, 0, 0))
            tangent.append(direction)
        previous = window
        for k in range(1, 17):
            u = k / 17
            h00, h01 = 2 * u ** 3 - 3 * u ** 2 + 1, -2 * u ** 3 + 3 * u ** 2
            h10, h11 = u ** 3 - 2 * u ** 2 + u, u ** 3 - u ** 2
            ring = []
            for q, r, tq in zip(begin, end, tangent):
                distance = (r - q).length
                axis = Vector((sign, 0, -math.tan(math.radians(42)))).normalized() * distance
                ring.append(bm.verts.new(q * h00 + r * h01 + tq * h10 + axis * h11))
                fair[ring[-1]] = 1 - fade(0.75, 1, u)
            stitch(bm, previous, ring)
            previous = ring
        stitch(bm, previous, arm, plane_angle)
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    # Fair the graft's varying boundary sampling in the surface, rather than
    # adding or inflating an axillary volume. The width is fixed. Taubin's
    # paired steps remove local creases without broad shoulder shrinkage;
    # the footprint vanishes smoothly into the direct contour landmarks.
    fair = {v: w for v, w in fair.items() if v.is_valid and w > 0}
    neighbors = {v: [e.other_vert(v) for e in v.link_edges] for v in fair}
    for _ in range(32):
        for factor in (0.5, -0.53):
            moved = {}
            for v, w in fair.items():
                average = sum((q.co for q in neighbors[v]), Vector()) / len(neighbors[v])
                delta = (average - v.co) * factor * w
                delta.x = 0
                moved[v] = v.co + delta
            for v, p in moved.items():
                v.co = p
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.data.update()
    obj["torso_surface"] = "tensor_silhouette_loft"

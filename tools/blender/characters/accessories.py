"""Small character props rigidly attached to a bone: flowers, crowns,
hair clips, the maid headdress, a knight's sword, Echidna's fox scarf,
and braids."""
from __future__ import annotations

import math

import bpy  # noqa: F401
import bmesh
from mathutils import Matrix, Vector


def _obj(name: str, bm: bmesh.types.BMesh, mat, smooth=True) -> bpy.types.Object:
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if mat is not None:
        o.data.materials.append(mat)
    return o


def orient(o: bpy.types.Object, position: Vector, normal: Vector, spin: float = 0.0) -> None:
    """Point the object's local +Z along `normal` at `position`."""
    q = Vector((0, 0, 1)).rotation_difference(normal.normalized())
    m = Matrix.Translation(position) @ q.to_matrix().to_4x4() @ Matrix.Rotation(spin, 4, "Z")
    o.data.transform(m)


def flower(name: str, position: Vector, normal: Vector, radius: float, petals: int, mat_petal, mat_centre, cup: float = 0.35) -> bpy.types.Object:
    bm = bmesh.new()
    for i in range(petals):
        a = 2 * math.pi * i / petals
        base = bm.verts.new((0, 0, 0))
        ring = []
        for k in range(7):
            t = k / 6
            w = math.sin(math.pi * t) * radius * 0.38
            r = radius * t
            lx = math.cos(a) * r - math.sin(a) * w * (1 if k < 4 else 1)
            ly = math.sin(a) * r + math.cos(a) * w
            ring.append(bm.verts.new((lx, ly, cup * r * r / radius)))
        other = []
        for k in range(7):
            t = k / 6
            w = -math.sin(math.pi * t) * radius * 0.38
            r = radius * t
            other.append(bm.verts.new((math.cos(a) * r - math.sin(a) * w, math.sin(a) * r + math.cos(a) * w, cup * r * r / radius)))
        for k in range(6):
            bm.faces.new((ring[k], ring[k + 1], other[k + 1], other[k]))
        bm.verts.remove(base)
    petals_o = _obj(name, bm, mat_petal)
    sol = petals_o.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = radius * 0.06
    bpy.context.view_layer.objects.active = petals_o
    bpy.ops.object.modifier_apply(modifier=sol.name)
    orient(petals_o, position, normal)
    bm2 = bmesh.new()
    bmesh.ops.create_uvsphere(bm2, u_segments=10, v_segments=6, radius=radius * 0.22)
    centre = _obj(name + "_c", bm2, mat_centre)
    orient(centre, position + normal.normalized() * radius * 0.08, normal)
    return join([petals_o, centre], name)


def crown(name: str, position: Vector, normal: Vector, radius: float, mat) -> bpy.types.Object:
    bm = bmesh.new()
    n = 10
    h = radius * 0.9
    base, top = [], []
    for i in range(n * 2):
        a = 2 * math.pi * i / (n * 2)
        base.append(bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, 0)))
        th = h if i % 2 == 0 else h * 0.45
        top.append(bm.verts.new((math.cos(a) * radius * 1.08, math.sin(a) * radius * 1.08, th)))
    for i in range(n * 2):
        j = (i + 1) % (n * 2)
        bm.faces.new((base[i], base[j], top[j], top[i]))
    o = _obj(name, bm, mat, smooth=False)
    sol = o.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = radius * 0.08
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=sol.name)
    orient(o, position, normal)
    return o


def x_clip(name: str, position: Vector, normal: Vector, size: float, mat) -> bpy.types.Object:
    parts = []
    for k, ang in enumerate((math.pi / 4, -math.pi / 4)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector((size, size * 0.22, size * 0.12)), verts=bm.verts)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(ang, 3, "Z"))
        o = _obj(f"{name}{k}", bm, mat, smooth=False)
        orient(o, position, normal)
        parts.append(o)
    return join(parts, name)


def headdress(name: str, head_c: Vector, head_rw: float, head_rh: float, mat, frills: int = 14) -> bpy.types.Object:
    """Maid headdress: a frilled band arching over the crown from ear to ear."""
    bm = bmesh.new()
    rows = []
    for i in range(frills * 2 + 1):
        t = i / (frills * 2)
        a = math.pi * (0.1 + 0.8 * t)
        # arc in the XZ plane just in front of the crown
        x = math.cos(a) * head_rw * 1.06
        z = math.sin(a) * head_rh * 1.02 + head_rh * 0.15
        wave = 0.35 + 0.65 * abs(math.sin(i * math.pi / 2))
        inner = Vector((head_c.x + x, head_c.y - head_rw * 0.25, head_c.z + z))
        outer = Vector((head_c.x + x * 1.12, head_c.y - head_rw * 0.36, head_c.z + z + head_rh * 0.16 * wave))
        rows.append((bm.verts.new(inner), bm.verts.new(outer)))
    for i in range(len(rows) - 1):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    o = _obj(name, bm, mat)
    sol = o.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.006
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=sol.name)
    return o


def sword(name: str, hip: Vector, H: float, mat_blade, mat_hilt, mat_sheath) -> bpy.types.Object:
    """A knight's sword in its scabbard, hanging at the left hip, angled back."""
    parts = []
    L = 0.47 * H
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.022, radius2=0.018, depth=L)
    sheath = _obj(name + "_sh", bm, mat_sheath)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((0.14, 0.03, 0.025)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, L / 2 + 0.01)), verts=bm.verts)
    guard = _obj(name + "_g", bm, mat_hilt, smooth=False)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.016, radius2=0.016, depth=0.18)
    bmesh.ops.translate(bm, vec=Vector((0, 0, L / 2 + 0.11)), verts=bm.verts)
    grip = _obj(name + "_h", bm, mat_blade)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.024)
    bmesh.ops.translate(bm, vec=Vector((0, 0, L / 2 + 0.21)), verts=bm.verts)
    pommel = _obj(name + "_p", bm, mat_hilt)
    parts = [sheath, guard, grip, pommel]
    o = join(parts, name)
    # Hilt up and forward at the left hip, the scabbard angled back and down.
    rot = Matrix.Rotation(math.radians(-8), 4, "Y") @ Matrix.Rotation(math.radians(30), 4, "X")
    hilt_dir = (rot.to_3x3() @ Vector((0, 0, 1))).normalized()
    centre = hip + Vector((0.035 * H, -0.01 * H, 0.0)) - hilt_dir * (L / 2 + 0.01)
    o.data.transform(Matrix.Translation(centre) @ rot)
    return o


def fox_scarf(name: str, j, mat_fur, mat_dark) -> bpy.types.Object:
    """Echidna in her usual form: a white fox draped around Anastasia's
    neck — body across the shoulders, head resting on the left collarbone,
    brush tail hanging down the right side of the chest."""
    from outfit import drape_down  # local: outfit imports bpy state lazily

    H = j.H
    parts = []
    body_r = 0.026 * H
    # Body path: left front → around the back → right front.
    path = []
    for i in range(15):
        a = math.radians(62 + (296 - 62) * i / 14)  # 0 = front, 90 = left
        x = math.sin(a) * 0.078 * H
        y = j.neck_base.y - math.cos(a) * 0.07 * H
        p = drape_down(j, x, y, body_r * 0.8) or Vector((x, y, j.neck_base.z - 0.02 * H))
        path.append(p)
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(path):
        t = i / (len(path) - 1)
        tan = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        a_ = tan.cross(Vector((0, 0, 1))).normalized()
        b_ = tan.cross(a_).normalized()
        r = body_r * (0.8 + 0.35 * math.sin(math.pi * t))
        rows.append([bm.verts.new(p + (a_ * math.cos(2 * math.pi * k / 12) + b_ * math.sin(2 * math.pi * k / 12)) * r) for k in range(12)])
    for i in range(len(rows) - 1):
        for k in range(12):
            bm.faces.new((rows[i][k], rows[i][(k + 1) % 12], rows[i + 1][(k + 1) % 12], rows[i + 1][k]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    parts.append(_obj(name + "_body", bm, mat_fur))

    # Head on the left front, tucked slightly down and inward.
    hc = path[0] + Vector((-0.006 * H, -0.02 * H, -0.004 * H))
    fwd = Vector((-0.25, -1.0, -0.35)).normalized()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        c = v.co
        # Fox skull: wide cheeks, tapering into the snout along -y.
        k = max(0.0, -c.y)
        v.co = Vector((c.x * 0.03 * H * (1 - 0.55 * k), c.y * (0.03 * H + 0.03 * H * k), c.z * 0.026 * H * (1 - 0.45 * k)))
    q = Vector((0, -1, 0)).rotation_difference(fwd)
    for v in bm.verts:
        v.co = hc + q @ v.co
    parts.append(_obj(name + "_head", bm, mat_fur))
    up = (q @ Vector((0, 0, 1))).normalized()
    right = (q @ Vector((1, 0, 0))).normalized()
    for side in (1, -1):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.013 * H, radius2=0.0, depth=0.03 * H)
        for v in bm.verts:
            v.co.y *= 0.45  # flat ears
        ear = _obj(name + f"_ear{side}", bm, mat_fur)
        ear_dir = (up * 1.0 + right * side * 0.45 - fwd * 0.35).normalized()
        orient(ear, hc + up * 0.022 * H + right * side * 0.014 * H - fwd * 0.004 * H + ear_dir * 0.012 * H, ear_dir)
        parts.append(ear)
        # Closed eyes: small dark crescents on the face.
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * 0.006 * H, v.co.y * 0.0018 * H, v.co.z * 0.0022 * H))
        eye = _obj(name + f"_eye{side}", bm, mat_dark)
        orient(eye, hc + fwd * 0.024 * H + up * 0.009 * H + right * side * 0.012 * H, fwd, spin=0.25 * side)
        parts.append(eye)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.0045 * H)
    nose = _obj(name + "_nose", bm, mat_dark)
    nose.data.transform(Matrix.Translation(hc + fwd * 0.058 * H + up * 0.002 * H))
    parts.append(nose)

    # Brush tail hanging down the right side of the chest.
    t0 = path[-1]
    tail_pts = [t0 + Vector((0.004 * H * i, -0.012 * H * i, -0.03 * H * i)) for i in range(7)]
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(tail_pts):
        t = i / (len(tail_pts) - 1)
        r = 0.022 * H + 0.02 * H * math.sin(math.pi * min(1.0, t * 1.3)) * (1 - t * 0.2)
        if i == len(tail_pts) - 1:
            r = 0.006 * H
        rows.append([bm.verts.new(p + Vector((math.cos(2 * math.pi * k / 12) * r, math.sin(2 * math.pi * k / 12) * r * 0.8, 0))) for k in range(12)])
    for i in range(len(rows) - 1):
        for k in range(12):
            bm.faces.new((rows[i][k], rows[i][(k + 1) % 12], rows[i + 1][(k + 1) % 12], rows[i + 1][k]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    parts.append(_obj(name + "_tail", bm, mat_fur))
    return join(parts, name)


def braid(name: str, points: list[Vector], lobe: float, mat) -> bpy.types.Object:
    """Braid: alternating overlapping lobes along a path (Meili's triple braid)."""
    parts = []
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        for k in range(3):
            t0 = k / 3
            c = a.lerp(b, t0 + 1 / 6)
            d = (b - a).normalized()
            side = Vector((1, 0, 0)).cross(d).normalized()
            off = side * lobe * 0.35 * math.cos(k * 2 * math.pi / 3) + Vector((1, 0, 0)) * lobe * 0.35 * math.sin(k * 2 * math.pi / 3)
            scale = lobe * (1 - 0.35 * (i / max(1, len(points) - 1)))
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
            for v in bm.verts:
                v.co = Vector((v.co.x * scale * 0.55, v.co.y * scale * 0.45, v.co.z * scale * 0.9))
            o = _obj(f"{name}_{i}_{k}", bm, mat)
            q = Vector((0, 0, 1)).rotation_difference(d)
            tilt = Matrix.Rotation((0.5 if k % 2 else -0.5), 4, "X")
            o.data.transform(Matrix.Translation(c + off) @ q.to_matrix().to_4x4() @ tilt)
            parts.append(o)
    return join(parts, name)


def join(objs, name):
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

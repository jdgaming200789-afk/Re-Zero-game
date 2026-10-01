"""Builds the Pleiades Watchtower exterior → public/assets/models/tower/watchtower_exterior.glb

A colossal tiered tower (~420 m) seen from the Augria dunes. The gate faces
Blender -Y (three +Z). The summit lantern marks where Shaula keeps watch.

Pieces:
  KIT_TowerBase / _LOD1   ground tier with gate, stairs and buttresses (walkable)
  KIT_TowerUpper / _LOD1  everything above the first cornice (landmark only)
  KIT_TowerGlass          lit windows (emissive, separate material)
  COL_*                   collision for the base

Run:  node tools/blender/run-blender.mjs tower
"""
from __future__ import annotations

import math
import os
import sys

import bpy  # must precede bmesh/mathutils when bpy is used as a module
import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from kit_common import (  # noqa: E402
    apply_transform,
    assign,
    bevel,
    boolean_diff,
    box,
    box_uv,
    collider_box,
    collider_cyl,
    cylinder,
    cylinder_uv,
    export_glb,
    join,
    lathe,
    make_lods,
    mesh_object,
    reset_scene,
    shade_smooth_by_angle,
    stats,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "models", "tower", "watchtower_exterior.glb")

# (radius, z_bottom, z_top, window_rows, buttresses)
TIERS = [
    (42.0, 5.0, 72.0, [22.0, 44.0, 60.0], 24),
    (35.0, 76.0, 158.0, [96.0, 120.0, 144.0], 20),
    (29.0, 162.0, 246.0, [182.0, 206.0, 230.0], 16),
    (23.0, 250.0, 330.0, [270.0, 292.0, 314.0], 12),
]
GATE_W = 12.0
GATE_H = 20.0


def ring_segment_windows(radius, z, count, w, h, skip_front=False, lit_every=0):
    """Dark arched window insets around a tier (with limestone surrounds)."""
    dark, frames, lit = [], [], []
    for i in range(count):
        a = 2 * math.pi * (i + 0.5) / count
        if skip_front and abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < 0.45:
            continue  # leave the gate side clear on the lowest tier
        c, s = math.cos(a), math.sin(a)
        is_lit = lit_every and (i % lit_every == 0)
        pane = box(f"win_{z}_{i}", (w, 0.4, h), (0, 0, 0), "dark")
        # The arch cap sits a little inside the pane's faces: flush caps
        # z-fought with the pane where they overlap.
        top = cylinder(f"wtop_{z}_{i}", w / 2, 0.34, (0, 0, 0), segments=12, mat="dark")
        top.rotation_euler = (math.pi / 2, 0, 0)
        top.location = (0, 0, h / 2)
        apply_transform(top)
        pane = join([pane, top], pane.name)
        frame = box(f"wf_{z}_{i}", (w + 1.0, 0.6, 0.5), (0, 0, -h / 2 - 0.25), "limestone_smooth")
        for o, depth in ((pane, radius - 0.05), (frame, radius + 0.15)):
            o.rotation_euler = (0, 0, a + math.pi / 2)
            o.location = (c * depth, s * depth, z)
            apply_transform(o)
        if is_lit:
            assign(pane, "glow__lantern")
            lit.append(pane)
        else:
            dark.append(pane)
        frames.append(frame)
    return dark, frames, lit


def tier(radius, z0, z1, rows, n_butt, lowest=False):
    parts = []
    body = cylinder(f"tier_{z0}", radius, z1 - z0, (0, 0, (z0 + z1) / 2), segments=96, mat="sandstone_ashlar")
    parts.append(body)
    # Cornice bands
    cornice = lathe(
        f"corn_{z0}",
        [(0.0, z1 - 0.2), (radius + 0.4, z1 - 0.2), (radius + 1.4, z1 + 0.6), (radius + 1.8, z1 + 1.4), (radius + 1.8, z1 + 2.2), (0.0, z1 + 2.2)],
        96,
        "limestone_smooth",
    )
    base_band = lathe(f"band_{z0}", [(0.0, z0), (radius + 1.0, z0), (radius + 1.0, z0 + 1.6), (radius + 0.3, z0 + 2.2), (0.0, z0 + 2.2)], 96, "limestone_smooth")
    parts += [cornice, base_band]
    # Buttresses / pilasters
    for i in range(n_butt):
        a = 2 * math.pi * i / n_butt
        if lowest and abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < 0.3:
            continue
        h = z1 - z0 - 2.4
        depth = 3.2 if lowest else 1.6
        b = box(f"but_{z0}_{i}", (3.0 if lowest else 2.0, depth, h), (0, 0, 0), "limestone_smooth")
        bm = bmesh.new()
        bm.from_mesh(b.data)
        for v in bm.verts:
            # taper the outer face toward the top
            t = (v.co.z + h / 2) / h
            if v.co.y > 0:
                v.co.y -= t * depth * 0.45
        bm.to_mesh(b.data)
        bm.free()
        b.rotation_euler = (0, 0, a - math.pi / 2)
        b.location = (math.cos(a) * (radius + depth / 2 - 0.2), math.sin(a) * (radius + depth / 2 - 0.2), z0 + 2.2 + h / 2)
        apply_transform(b)
        parts.append(b)
    dark, frames, lit = [], [], []
    for zi, zw in enumerate(rows):
        d, f, l = ring_segment_windows(radius, zw, n_butt, 3.2 if lowest else 2.6, 7.0 if lowest else 5.5, skip_front=lowest, lit_every=7 if zi == 1 else 0)
        dark += d
        frames += f
        lit += l
    return parts + dark + frames, lit


def build_gate(radius):
    """The great gate and approach stairs on the front (Blender -Y) face."""
    parts = []
    front_y = -radius
    # Recessed gate: a dark tunnel inset + a monumental arch frame.
    tunnel = box("gate_tunnel", (GATE_W, 14.0, GATE_H - GATE_W / 2), (0, front_y + 5.0, 5.0 + (GATE_H - GATE_W / 2) / 2), "dark")
    tun_top = cylinder("gate_tun_top", GATE_W / 2, 14.0, (0, 0, 0), segments=32, mat="dark")
    tun_top.rotation_euler = (math.pi / 2, 0, 0)
    tun_top.location = (0, front_y + 5.0, 5.0 + GATE_H - GATE_W / 2)
    apply_transform(tun_top)
    parts += [tunnel, tun_top]
    # Arch frame (voussoirs) and pylons
    for side in (-1, 1):
        pylon = box(f"pylon{side}", (5.0, 6.0, 30.0), (side * (GATE_W / 2 + 2.5), front_y - 1.8, 5.0 + 15.0), "limestone_smooth")
        bevel(pylon, 0.2, 2)
        cap = box(f"pycap{side}", (6.0, 7.0, 1.6), (side * (GATE_W / 2 + 2.5), front_y - 1.8, 35.8), "limestone_smooth")
        parts += [pylon, cap]
    arch = lathe("gate_arch", [(GATE_W / 2, 0.0), (GATE_W / 2 + 2.2, 0.0), (GATE_W / 2 + 2.2, 4.0), (GATE_W / 2, 4.0)], 48, "limestone_smooth", cap=False)
    # lathe revolves around Z; turn it into a vertical ring then cut the lower half
    arch.rotation_euler = (math.pi / 2, 0, 0)
    arch.location = (0, front_y - 3.8, 5.0 + GATE_H - GATE_W / 2)
    apply_transform(arch)
    cutter = box("arch_cut", (40, 20, 20), (0, front_y - 2.0, 5.0 + GATE_H - GATE_W / 2 - 10.0))
    boolean_diff(arch, cutter, solver="FAST")
    parts.append(arch)
    lintel = box("gate_lintel", (GATE_W + 10.0, 6.5, 3.0), (0, front_y - 1.8, 5.0 + GATE_H + 4.5), "limestone_smooth")
    bevel(lintel, 0.15, 2)
    parts.append(lintel)
    # Star emblem above the gate (gold)
    star = bmesh.new()
    pts = []
    for i in range(16):
        r = 2.4 if i % 2 == 0 else 0.9
        a = math.pi / 2 + i * math.pi / 8
        pts.append(star.verts.new((math.cos(a) * r, 0, math.sin(a) * r)))
    center = star.verts.new((0, 0, 0))
    for i in range(16):
        star.faces.new((center, pts[(i + 1) % 16], pts[i]))
    so = mesh_object("gate_star", star)
    solid = so.modifiers.new("Sol", "SOLIDIFY")
    solid.thickness = 0.3
    bpy.context.view_layer.objects.active = so
    bpy.ops.object.modifier_apply(modifier=solid.name)
    assign(so, "gold")
    so.location = (0, front_y - 5.2, 5.0 + GATE_H + 9.0)
    apply_transform(so)
    parts.append(so)
    # Great doors in the arch: two bronze leaves with banding and a seam.
    door_y = front_y - 2.0 - 0.18
    for side in (-1, 1):
        leaf = box(f"door{side}", (GATE_W / 2 - 0.12, 0.3, GATE_H - GATE_W / 2 - 0.2), (side * (GATE_W / 4 + 0.03), door_y, 5.0 + (GATE_H - GATE_W / 2) / 2), "wood_dark")
        parts.append(leaf)
        for k in range(4):
            band = box(f"door_band{side}_{k}", (GATE_W / 2 - 0.5, 0.12, 0.35), (side * (GATE_W / 4 + 0.03), door_y - 0.2, 6.6 + k * 3.6), "gold")
            parts.append(band)
        ring = cylinder(f"door_ring{side}", 0.42, 0.12, (0, 0, 0), segments=16, mat="gold")
        ring.rotation_euler = (math.pi / 2, 0, 0)
        ring.location = (side * 0.9, door_y - 0.24, 10.2)
        apply_transform(ring)
        parts.append(ring)
    parts += build_stairs(front_y)
    return parts


# Gate stairs: 19 solid treads rising to the landing (the 20th rise).
STAIR_W = 26.0
STAIR_RISE = 0.25
STAIR_RUN = 0.9
STAIR_STEPS = 19
CHEEK_W = 1.4


def landing_front(front_y):
    return front_y - 6.5


def stairs_foot(front_y):
    return landing_front(front_y) - STAIR_STEPS * STAIR_RUN


def build_stairs(front_y):
    """Broad stairs up to the gate threshold (5 m rise), from the plaza.

    Every tread is solid down to the ground (no floating slabs, no fill
    block to walk through), the top tread meets the landing at its edge
    (no coplanar tops to z-fight), and parapet cheeks close the sides.
    """
    parts = []
    land_y = landing_front(front_y)
    foot_y = stairs_foot(front_y)
    for i in range(STAIR_STEPS):
        top = STAIR_RISE * (i + 1)
        y0 = foot_y + i * STAIR_RUN
        parts.append(box(f"gst{i}", (STAIR_W, STAIR_RUN, top), (0, y0 + STAIR_RUN / 2, top / 2), "limestone_smooth"))
    slope = STAIR_RISE / STAIR_RUN
    for side in (-1, 1):
        x0 = side * STAIR_W / 2
        x1 = side * (STAIR_W / 2 + CHEEK_W)
        bm = bmesh.new()
        ya, yb = foot_y - 0.6, land_y
        za, zb = 1.0, 1.0 + (yb - foot_y) * slope
        vs = [bm.verts.new(v) for v in [(x0, ya, 0), (x1, ya, 0), (x1, yb, 0), (x0, yb, 0), (x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb)]]
        for f in [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
            bm.faces.new([vs[k] for k in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        cheek = mesh_object(f"gst_cheek{side}", bm)
        assign(cheek, "sandstone_ashlar")
        parts.append(cheek)
        # Coping along the cheek's top, and a newel block at its foot.
        cap = box(f"gst_cope{side}", (CHEEK_W + 0.3, math.hypot(yb - ya, zb - za) + 0.2, 0.22), (0, 0, 0), "limestone_smooth")
        cap.rotation_euler = (math.atan2(zb - za, yb - ya), 0, 0)
        cap.location = ((x0 + x1) / 2, (ya + yb) / 2, (za + zb) / 2 + 0.11)
        apply_transform(cap)
        parts.append(cap)
        newel = box(f"gst_newel{side}", (CHEEK_W + 0.6, 1.6, 1.7), ((x0 + x1) / 2, foot_y - 1.2, 0.85), "limestone_smooth")
        bevel(newel, 0.08, 2)
        parts.append(newel)
    return parts


def stair_colliders(front_y):
    """A ramp through the tread midpoints, and tall cheek walls."""
    land_y = landing_front(front_y)
    foot_y = stairs_foot(front_y)
    slope = STAIR_RISE / STAIR_RUN
    theta = math.atan(slope)
    # Ramp top: z = (y - y_start) * slope, rising to 5.0 just past the landing edge.
    y_start = foot_y - 0.5 * STAIR_RUN
    y_end = y_start + 5.0 / slope
    length = math.hypot(y_end - y_start, 5.0)
    thick = 6.0
    my, mz = (y_start + y_end) / 2, 2.5
    c = collider_box("TowerBase", 3, (STAIR_W, length, thick), (0, my + math.sin(theta) * thick / 2, mz - math.cos(theta) * thick / 2))
    c.rotation_euler = (theta, 0, 0)
    for side in (-1, 1):
        ya, yb = foot_y - 0.6, land_y
        za, zb = 1.0, 1.0 + (yb - foot_y) * slope + 0.22
        th = math.atan2(zb - za, yb - ya)
        ln = math.hypot(yb - ya, zb - za)
        t = 9.0
        cc = collider_box("TowerBase", 8 + (side > 0), (CHEEK_W, ln, t), (side * (STAIR_W / 2 + CHEEK_W / 2), (ya + yb) / 2 + math.sin(th) * t / 2, (za + zb) / 2 - math.cos(th) * t / 2))
        cc.rotation_euler = (th, 0, 0)
        collider_box("TowerBase", 10 + (side > 0), (CHEEK_W + 0.6, 1.6, 1.7), (side * (STAIR_W / 2 + CHEEK_W / 2), foot_y - 1.2, 0.85))


def build_landing(radius, front_y):
    """The gate landing, cut back where the plinth's top ring already is
    (their tops share z = 5: overlapping, they z-fought)."""
    landing = box("gate_landing", (GATE_W + 20.0, 8.0, 5.0), (0, front_y - 2.5, 2.5), "limestone_smooth")
    cutter = cylinder("landing_cut", radius + 3.0 + 0.02, 12.0, (0, 0, 2.5), segments=96)
    boolean_diff(landing, cutter, solver="EXACT")
    return landing


def build_plinth(radius):
    steps = []
    for i, (r, h) in enumerate([(radius + 7.0, 1.6), (radius + 5.0, 3.2), (radius + 3.0, 5.0)]):
        steps.append(cylinder(f"plinth{i}", r, h, (0, 0, h / 2), segments=96, mat="limestone_smooth"))
    return steps


def build_crown(z0):
    """Maia: open colonnade, dome and the summit lantern."""
    parts = []
    r = 17.0
    parts.append(cylinder("crown_floor", r + 2.0, 2.0, (0, 0, z0 + 1.0), segments=64, mat="limestone_smooth"))
    for i in range(16):
        a = 2 * math.pi * i / 16
        col = cylinder(f"crown_col{i}", 0.9, 22.0, (math.cos(a) * r, math.sin(a) * r, z0 + 2.0 + 11.0), segments=16, mat="limestone_smooth")
        parts.append(col)
    parts.append(cylinder("crown_core", r - 6.0, 22.0, (0, 0, z0 + 13.0), segments=48, mat="sandstone_ashlar"))
    parts.append(lathe("crown_ent", [(0.0, z0 + 24.0), (r + 2.5, z0 + 24.0), (r + 2.5, z0 + 27.0), (r + 1.0, z0 + 28.0), (0.0, z0 + 28.0)], 64, "limestone_smooth"))
    dome = lathe(
        "dome",
        [(r + 0.5, z0 + 28.0)] + [((r + 0.5) * math.cos(t * math.pi / 2 * 0.95), z0 + 28.0 + 16.0 * math.sin(t * math.pi / 2 * 0.95)) for t in [i / 12 for i in range(1, 13)]] + [(0.0, z0 + 44.2)],
        64,
        "bronze",
    )
    parts.append(dome)
    # Spire and the star lantern (Shaula's post)
    parts.append(cylinder("spire", 1.8, 36.0, (0, 0, z0 + 44.0 + 18.0), segments=12, mat="bronze", radius_top=0.3))
    lantern = cylinder("lantern_cage", 3.2, 6.0, (0, 0, z0 + 47.0), segments=8, mat="gold")
    parts.append(lantern)
    glow = cylinder("lantern_glow", 2.4, 5.0, (0, 0, z0 + 47.0), segments=16, mat="glow__star")
    return parts, glow


def main():
    reset_scene()
    base_parts = []
    upper_parts = []
    lit = []

    base_parts += build_plinth(TIERS[0][0])
    for idx, (r, z0, z1, rows, n) in enumerate(TIERS):
        p, l = tier(r, z0, z1, rows, n, lowest=idx == 0)
        (base_parts if idx == 0 else upper_parts).extend(p)
        lit += l
        # Setback terraces between tiers
        if idx + 1 < len(TIERS):
            nr = TIERS[idx + 1][0]
            upper_parts.append(lathe(f"terrace_{z1}", [(0.0, z1 + 2.2), (r + 1.8, z1 + 2.2), (r + 1.8, z1 + 3.0), (nr + 1.5, TIERS[idx + 1][1]), (0.0, TIERS[idx + 1][1])], 96, "limestone_smooth"))
    crown, glow = build_crown(TIERS[-1][2] + 2.2)
    upper_parts += crown
    base_parts += build_gate(TIERS[0][0])
    base_parts.append(build_landing(TIERS[0][0], -TIERS[0][0]))

    base = join(base_parts, "TowerBase")
    base.name = "KIT_TowerBase"
    box_uv(base, meters_per_unit=1.6)  # monumental masonry: larger courses than the kit
    shade_smooth_by_angle(base, 30)
    base["surface"] = "stone"
    make_lods(base, (0.35,))

    upper = join(upper_parts, "TowerUpper")
    upper.name = "KIT_TowerUpper"
    box_uv(upper, meters_per_unit=2.4)
    shade_smooth_by_angle(upper, 30)
    make_lods(upper, (0.3,))

    lit_obj = join(lit + [glow], "TowerGlass")
    lit_obj.name = "KIT_TowerGlass"
    box_uv(lit_obj, 1.0)

    # Collision: the tower body, plinth steps, gate stairs (as a ramp) and landing
    r0 = TIERS[0][0]
    # Body collider hugs the wall face so the gate recess and landing stay walkable.
    collider_cyl("TowerBase", 0, r0 + 0.3, 72.0, (0, 0, 36.0))
    for i in range(TIERS[0][4]):
        a = 2 * math.pi * i / TIERS[0][4]
        if abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < 0.3:
            continue
        collider_box("TowerBase", 20 + i, (3.0, 3.2, 30.0), (math.cos(a) * (r0 + 1.4), math.sin(a) * (r0 + 1.4), 20.0), rot_z=a - math.pi / 2)
    collider_cyl("TowerBase", 1, r0 + 7.0, 1.6, (0, 0, 0.8))
    collider_cyl("TowerBase", 2, r0 + 5.0, 3.2, (0, 0, 1.6))
    # The plinth's top ring is walkable where the landing meets it.
    collider_cyl("TowerBase", 7, r0 + 3.0, 5.0, (0, 0, 2.5))
    front_y = -r0
    stair_colliders(front_y)
    collider_box("TowerBase", 4, (GATE_W + 20.0, 8.0, 5.0), (0, front_y - 2.5, 2.5))
    # The closed doors (their face sits 0.33 m in front of the tunnel).
    collider_box("TowerBase", 12, (GATE_W, 1.0, GATE_H), (0, front_y - 2.0 - 0.33 + 0.5, 5.0 + GATE_H / 2))
    for side in (-1, 1):
        collider_box("TowerBase", 5 + (side > 0), (5.0, 6.0, 30.0), (side * (GATE_W / 2 + 2.5), front_y - 1.8, 20.0))

    export_glb(OUT)
    s = stats()
    print(f"tower: {s['tris']} triangles → {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

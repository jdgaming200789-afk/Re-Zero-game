"""Builds the modular Pleiades Watchtower kit → public/assets/models/kit/watchtower_kit.glb

Axis convention (Blender, Z up). The glTF exporter converts to three.js Y-up:
Blender (x, y, z) → three (x, z, -y). Every piece faces Blender -Y (three +Z);
stairs rise toward Blender +Y (three -Z, i.e. walking "forward" from the front).

Run:  node tools/blender/run-blender.mjs kit
"""
from __future__ import annotations

import math
import os
import random
import sys

import bpy  # must precede bmesh/mathutils when bpy is used as a module
import bmesh
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(__file__))
from kit_common import (  # noqa: E402
    apply_transform,
    assign,
    bevel,
    boolean_diff,
    box,
    collider_box,
    collider_cyl,
    collider_hull,
    cylinder,
    export_glb,
    finalize,
    fluted_column_shaft,
    join,
    lathe,
    make_lods,
    mesh_object,
    reset_scene,
    rock_blob,
    stats,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "models", "kit", "watchtower_kit.glb")

WALL_W = 4.0
WALL_H = 6.0
WALL_T = 0.8


def bx(name, size, center, mat, bev=0.015, seg=2):
    o = box(name, size, center, mat)
    if bev > 0:
        bevel(o, bev, seg)
    return o


def arch_ring(name, inner_r, outer_r, depth, mat, segments=18, center=(0, 0, 0)):
    """Semicircular voussoir ring in the XZ plane, thickness along Y."""
    bm = bmesh.new()
    verts = []
    for i in range(segments + 1):
        a = math.pi * i / segments
        c, s = math.cos(a), math.sin(a)
        row = []
        for r in (inner_r, outer_r):
            for y in (-depth / 2, depth / 2):
                row.append(bm.verts.new((center[0] + r * c, center[1] + y, center[2] + r * s)))
        verts.append(row)
    for i in range(segments):
        a, b = verts[i], verts[i + 1]
        # inner, outer, front, back faces
        bm.faces.new((a[0], a[1], b[1], b[0]))
        bm.faces.new((a[2], b[2], b[3], a[3]))
        bm.faces.new((a[0], b[0], b[2], a[2]))
        bm.faces.new((a[1], a[3], b[3], b[1]))
    for row in (verts[0], verts[-1]):
        bm.faces.new((row[0], row[2], row[3], row[1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_object(name, bm)
    assign(o, mat)
    return o


def cut_arched_opening(target, width, height, depth, center_x=0.0, base_z=0.0):
    """Subtract a round-headed opening (rectangle + half cylinder) from `target`.

    The two cutter shapes are subtracted one after another: a joined,
    overlapping cutter is not a valid closed volume for the exact solver.
    """
    r = width / 2
    rect_h = height - r
    rect = box("cut_r", (width, depth, rect_h + 0.02), (center_x, 0, base_z + rect_h / 2))
    boolean_diff(target, rect)
    cyl = cylinder("cut_c", r, depth, (0, 0, 0), segments=32)
    cyl.rotation_euler = (math.pi / 2, 0, 0)
    cyl.location = (center_x, 0, base_z + rect_h)
    apply_transform(cyl)
    boolean_diff(target, cyl)


# ============================================================================ architecture


def wall_parts(prefix):
    core = bx(prefix + "_core", (WALL_W, WALL_T, WALL_H), (0, 0, WALL_H / 2), "sandstone_ashlar", bev=0.0)
    plinth = bx(prefix + "_plinth", (WALL_W, WALL_T + 0.2, 0.5), (0, 0, 0.25), "limestone_smooth")
    cap = bx(prefix + "_cap", (WALL_W, WALL_T + 0.14, 0.08), (0, 0, 0.54), "limestone_smooth", bev=0.01)
    cornice_lo = bx(prefix + "_cl", (WALL_W, WALL_T + 0.16, 0.12), (0, 0, WALL_H - 0.36), "limestone_smooth", bev=0.01)
    cornice = bx(prefix + "_cn", (WALL_W, WALL_T + 0.3, 0.3), (0, 0, WALL_H - 0.15), "limestone_smooth")
    return core, [plinth, cap, cornice_lo, cornice]


def build_wall():
    core, trims = wall_parts("wall")
    o = join([core, *trims], "Wall_4x6")
    finalize(o, "Wall_4x6")
    collider_box("Wall_4x6", 0, (WALL_W, WALL_T + 0.2, WALL_H), (0, 0, WALL_H / 2))


def build_wall_window():
    core, trims = wall_parts("wallw")
    cut_arched_opening(core, 1.4, 2.6, WALL_T + 0.6, base_z=2.2)
    frame = arch_ring("wframe", 0.7, 0.9, WALL_T + 0.08, "limestone_smooth", center=(0, 0, 2.2 + 1.9))
    jl = bx("wjl", (0.2, WALL_T + 0.08, 1.9), (-0.8, 0, 2.2 + 0.95), "limestone_smooth")
    jr = bx("wjr", (0.2, WALL_T + 0.08, 1.9), (0.8, 0, 2.2 + 0.95), "limestone_smooth")
    sill = bx("wsill", (1.9, WALL_T + 0.25, 0.14), (0, 0, 2.13), "limestone_smooth")
    key = bx("wkey", (0.28, WALL_T + 0.14, 0.4), (0, 0, 2.2 + 1.9 + 0.8), "limestone_smooth")
    o = join([core, *trims, frame, jl, jr, sill, key], "Wall_4x6_Window")
    finalize(o, "Wall_4x6_Window")
    collider_box("Wall_4x6_Window", 0, (1.3, WALL_T + 0.2, WALL_H), (-1.35, 0, WALL_H / 2))
    collider_box("Wall_4x6_Window", 1, (1.3, WALL_T + 0.2, WALL_H), (1.35, 0, WALL_H / 2))
    collider_box("Wall_4x6_Window", 2, (1.4, WALL_T + 0.2, 2.2), (0, 0, 1.1))
    collider_box("Wall_4x6_Window", 3, (1.4, WALL_T + 0.2, 1.3), (0, 0, WALL_H - 0.65))


def build_wall_door():
    core, trims = wall_parts("walld")
    # Plinth pieces must not block the doorway.
    cut_trim = box("dtcut", (2.4, WALL_T + 0.8, 1.2), (0, 0, 0.5))
    for t in trims[:2]:
        c2 = cut_trim.copy()
        c2.data = cut_trim.data.copy()
        bpy.context.scene.collection.objects.link(c2)
        boolean_diff(t, c2)
    bpy.data.objects.remove(cut_trim, do_unlink=True)
    cut_arched_opening(core, 2.4, 3.8, WALL_T + 0.6, base_z=-0.05)
    frame = arch_ring("dframe", 1.2, 1.45, WALL_T + 0.1, "limestone_smooth", center=(0, 0, 2.6))
    jl = bx("djl", (0.25, WALL_T + 0.1, 2.6), (-1.325, 0, 1.3), "limestone_smooth")
    jr = bx("djr", (0.25, WALL_T + 0.1, 2.6), (1.325, 0, 1.3), "limestone_smooth")
    key = bx("dkey", (0.34, WALL_T + 0.16, 0.5), (0, 0, 2.6 + 1.3), "limestone_smooth")
    o = join([core, *trims, frame, jl, jr, key], "Wall_4x6_Door")
    finalize(o, "Wall_4x6_Door")
    collider_box("Wall_4x6_Door", 0, (0.75, WALL_T + 0.2, WALL_H), (-1.625, 0, WALL_H / 2))
    collider_box("Wall_4x6_Door", 1, (0.75, WALL_T + 0.2, WALL_H), (1.625, 0, WALL_H / 2))
    collider_box("Wall_4x6_Door", 2, (2.5, WALL_T + 0.2, WALL_H - 3.85), (0, 0, 3.85 + (WALL_H - 3.85) / 2))


def build_floor():
    slab = bx("floor", (4, 4, 0.3), (0, 0, -0.15), "marble_tiles", bev=0.004, seg=1)
    finalize(slab, "Floor_4x4")
    collider_box("Floor_4x4", 0, (4, 4, 0.3), (0, 0, -0.15))
    stone = bx("floors", (4, 4, 0.3), (0, 0, -0.15), "flagstone", bev=0.004, seg=1)
    finalize(stone, "Floor_4x4_Stone")
    collider_box("Floor_4x4_Stone", 0, (4, 4, 0.3), (0, 0, -0.15))


def build_column(name="Column_6", height=6.0, broken_at=None):
    base = bx(name + "_b", (1.2, 1.2, 0.25), (0, 0, 0.125), "limestone_smooth")
    torus = lathe(name + "_t", [(0.0, 0.25), (0.56, 0.25), (0.6, 0.3), (0.58, 0.37), (0.5, 0.42), (0.0, 0.42)], 32, "limestone_smooth")
    shaft_h = (broken_at or height) - 0.42 - (0 if broken_at else 0.6)
    shaft = fluted_column_shaft(name + "_s", 0.46, shaft_h, flutes=20, z0=0.42, taper=0.93 if not broken_at else 0.97, mat="limestone_smooth")
    parts = [base, torus, shaft]
    if not broken_at:
        top = 0.42 + shaft_h
        echinus = lathe(name + "_e", [(0.0, top), (0.43, top), (0.47, top + 0.08), (0.62, top + 0.3), (0.0, top + 0.3)], 32, "limestone_smooth")
        abacus = bx(name + "_a", (1.3, 1.3, height - top - 0.3), (0, 0, top + 0.3 + (height - top - 0.3) / 2), "limestone_smooth")
        parts += [echinus, abacus]
    else:
        # Jagged break: a tilted cutter chews the top
        cutter = box(name + "_cut", (2, 2, 1.5), (0, 0, broken_at + 0.6))
        cutter.rotation_euler = (0.35, 0.2, 0.0)
        apply_transform(cutter)
        boolean_diff(shaft, cutter)
    o = join(parts, name)
    finalize(o, name, smooth_angle=50)
    make_lods(o)
    collider_cyl(name, 0, 0.5, broken_at or height, (0, 0, (broken_at or height) / 2))


def build_column_drum():
    drum = fluted_column_shaft("drum", 0.46, 1.1, flutes=20, z0=-0.55, taper=1.0, mat="limestone_smooth")
    drum.rotation_euler = (0, math.pi / 2, 0.3)
    drum.location = (0, 0, 0.44)
    apply_transform(drum)
    finalize(drum, "ColumnDrum", smooth_angle=50)
    c = collider_cyl("ColumnDrum", 0, 0.46, 1.1, (0, 0, 0))
    c.rotation_euler = (0, math.pi / 2, 0.3)
    c.location = (0, 0, 0.44)


def build_arch():
    """Spandrel with an arched underside; sits on two columns 4 m apart."""
    body = bx("arch", (4.0, 0.9, 2.2), (0, 0, 1.1), "sandstone_ashlar", bev=0.0)
    cut = cylinder("archcut", 1.55, 1.6, (0, 0, 0), segments=48)
    cut.rotation_euler = (math.pi / 2, 0, 0)
    apply_transform(cut)
    boolean_diff(body, cut)
    ring = arch_ring("archring", 1.55, 1.75, 0.95, "limestone_smooth", segments=24)
    key = bx("archkey", (0.36, 1.0, 0.5), (0, 0, 1.65), "limestone_smooth")
    cap = bx("archcap", (4.0, 1.1, 0.22), (0, 0, 2.2), "limestone_smooth")
    o = join([body, ring, key, cap], "Arch_4")
    finalize(o, "Arch_4")
    collider_box("Arch_4", 0, (4.0, 1.0, 0.6), (0, 0, 1.95))


def build_stairs():
    steps = []
    n, rise, run, w = 15, 0.2, 0.4, 4.0
    for i in range(n):
        h = rise * (i + 1)
        steps.append(bx(f"st{i}", (w, run, 0.2), (0, run * i + run / 2, h - 0.1), "limestone_smooth", bev=0.012))
    # solid underside so the flight reads as masonry from the side
    under = bmesh.new()
    pts = [(0, 0), (n * run, n * rise - 0.2), (n * run, n * rise - 0.4), (0.4, 0)]
    for side in (-w / 2 + 0.01, w / 2 - 0.01):
        pass
    bm = bmesh.new()
    vs = []
    for x in (-w / 2 + 0.02, w / 2 - 0.02):
        vs.append([bm.verts.new((x, y, z)) for y, z in [(0.0, 0.0), (n * run, n * rise - 0.2), (n * run, 0.0)]])
    bm.faces.new(vs[0])
    bm.faces.new(list(reversed(vs[1])))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((vs[0][i], vs[1][i], vs[1][j], vs[0][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    fill = mesh_object("stfill", bm)
    assign(fill, "sandstone_ashlar")
    under.free()
    stringers = []
    slope = math.atan2(n * rise, n * run)
    length = math.hypot(n * run, n * rise)
    for sgn in (-1, 1):
        sg = bx(f"sg{sgn}", (0.3, length + 0.3, 0.5), (0, 0, 0), "limestone_smooth")
        sg.rotation_euler = (slope, 0, 0)
        sg.location = (sgn * (w / 2 + 0.15), n * run / 2, n * rise / 2 - 0.05)
        apply_transform(sg)
        stringers.append(sg)
    o = join(steps + [fill] + stringers, "Stairs_4w")
    finalize(o, "Stairs_4w")
    # Smooth ramp collider for stable movement and camera
    c = collider_box("Stairs_4w", 0, (w, length, 0.3), (0, n * run / 2, n * rise / 2 - 0.1))
    c.rotation_euler = (math.atan2(n * rise, n * run), 0, 0)
    collider_box("Stairs_4w", 1, (w, 0.6, 0.3), (0, n * run + 0.1, n * rise - 0.15))


def build_balustrade():
    rail_b = bx("bb", (2.0, 0.34, 0.14), (0, 0, 0.07), "limestone_smooth", bev=0.01)
    rail_t = bx("bt", (2.0, 0.3, 0.12), (0, 0, 0.98), "limestone_smooth", bev=0.02)
    posts = []
    prof = [(0.0, 0.14), (0.07, 0.14), (0.07, 0.2), (0.05, 0.26), (0.1, 0.45), (0.11, 0.55), (0.05, 0.72), (0.06, 0.82), (0.08, 0.86), (0.08, 0.92), (0.0, 0.92)]
    for i in range(6):
        p = lathe(f"bp{i}", prof, 12, "limestone_smooth")
        p.location.x = -0.83 + i * (1.66 / 5)
        apply_transform(p)
        posts.append(p)
    o = join([rail_b, rail_t, *posts], "Balustrade_2")
    finalize(o, "Balustrade_2", smooth_angle=60)
    make_lods(o, (0.4,))
    collider_box("Balustrade_2", 0, (2.0, 0.3, 1.1), (0, 0, 0.55))


def build_pedestal():
    parts = [
        bx("pd0", (1.0, 1.0, 0.18), (0, 0, 0.09), "limestone_smooth"),
        bx("pd1", (0.8, 0.8, 0.9), (0, 0, 0.63), "sandstone_ashlar", bev=0.01),
        bx("pd2", (0.96, 0.96, 0.14), (0, 0, 1.15), "limestone_smooth"),
    ]
    o = join(parts, "Pedestal")
    finalize(o, "Pedestal")
    collider_box("Pedestal", 0, (1.0, 1.0, 1.22), (0, 0, 0.61))


def build_ruin_wall(name, length=6.0, height=2.6, seed=3):
    """Dry-stacked ruined wall: individual blocks, missing and displaced ones."""
    rnd = random.Random(seed)
    blocks = []
    course_h = 0.52
    courses = int(height / course_h)
    for c in range(courses):
        x = -length / 2 + rnd.uniform(-0.2, 0.2)
        # profile of the ruin: taller in the middle, crumbled at the ends
        while x < length / 2:
            w = rnd.uniform(0.7, 1.3)
            cx = x + w / 2
            t = abs(cx) / (length / 2)
            limit = height * (1 - t**1.8) + rnd.uniform(-0.6, 0.3)
            if c * course_h < limit and rnd.random() > 0.08:
                b = bx(f"{name}_{c}_{len(blocks)}", (w - 0.03, 0.7 + rnd.uniform(-0.05, 0.05), course_h - 0.02), (cx, rnd.uniform(-0.04, 0.04), c * course_h + course_h / 2), "sandstone_ashlar", bev=0.05, seg=2)
                b.rotation_euler = (rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), rnd.uniform(-0.03, 0.03))
                apply_transform(b)
                blocks.append(b)
            x += w
    # fallen blocks at the base
    for i in range(4):
        b = bx(f"{name}_f{i}", (rnd.uniform(0.6, 1.0), 0.6, 0.48), (rnd.uniform(-length / 2, length / 2), rnd.choice([-1, 1]) * rnd.uniform(0.7, 1.4), 0.2), "sandstone_ashlar", bev=0.06)
        b.rotation_euler = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.2, 0.2), rnd.uniform(0, math.pi))
        apply_transform(b)
        blocks.append(b)
    o = join(blocks, name)
    finalize(o, name)
    make_lods(o, (0.5, 0.25))
    collider_hull(name, 0, o)


def build_obelisk():
    shaft = cylinder("ob", 0.9, 9.0, (0, 0, 4.5 + 0.8), segments=4, radius_top=0.6, mat="limestone_smooth")
    shaft.rotation_euler = (0, 0, math.pi / 4)
    apply_transform(shaft)
    bevel(shaft, 0.03, 2)
    tip = cylinder("obt", 0.6, 0.9, (0, 0, 9.8 + 0.45), segments=4, radius_top=0.0, mat="bronze")
    tip.rotation_euler = (0, 0, math.pi / 4)
    apply_transform(tip)
    base = bx("obb", (2.2, 2.2, 0.8), (0, 0, 0.4), "sandstone_ashlar", bev=0.03)
    band = bx("obband", (1.34, 1.34, 0.25), (0, 0, 3.0), "bronze", bev=0.01)
    o = join([shaft, tip, base, band], "Obelisk")
    finalize(o, "Obelisk")
    collider_box("Obelisk", 0, (2.2, 2.2, 0.8), (0, 0, 0.4))
    collider_box("Obelisk", 1, (1.3, 1.3, 9.6), (0, 0, 5.4))


def build_fallen_giant():
    """A colossal fallen column in pieces — sells the tower's scale outside."""
    rnd = random.Random(9)
    parts = []
    x = 0.0
    for i in range(3):
        L = rnd.uniform(3.2, 4.4)
        d = fluted_column_shaft(f"fg{i}", 1.35, L, flutes=24, z0=-L / 2, taper=1.0, mat="limestone_smooth")
        d.rotation_euler = (rnd.uniform(-0.05, 0.05), math.pi / 2, rnd.uniform(-0.12, 0.12))
        d.location = (x + L / 2, rnd.uniform(-0.3, 0.3), 1.1 - rnd.uniform(0, 0.25))
        apply_transform(d)
        parts.append(d)
        x += L + rnd.uniform(0.3, 1.1)
    o = join(parts, "FallenGiant")
    for v in o.data.vertices:
        v.co.x -= x / 2
    finalize(o, "FallenGiant", smooth_angle=50)
    make_lods(o, (0.4, 0.15))
    c = collider_cyl("FallenGiant", 0, 1.3, x, (0, 0, 1.0))
    c.rotation_euler = (0, math.pi / 2, 0)


# ============================================================================ props


def build_bookshelf():
    w, d, h = 2.0, 0.45, 3.0
    parts = [
        bx("bs_l", (0.07, d, h), (-w / 2 + 0.035, 0, h / 2), "wood_dark", bev=0.008),
        bx("bs_r", (0.07, d, h), (w / 2 - 0.035, 0, h / 2), "wood_dark", bev=0.008),
        bx("bs_b", (w, 0.03, h), (0, d / 2 - 0.015, h / 2), "wood_dark", bev=0.0),
        bx("bs_top", (w + 0.14, d + 0.1, 0.12), (0, -0.02, h + 0.06), "wood_dark", bev=0.015),
        bx("bs_kick", (w, d, 0.12), (0, 0, 0.06), "wood_dark", bev=0.008),
    ]
    shelves = []
    for i in range(6):
        z = 0.12 + i * 0.5
        parts.append(bx(f"bs_s{i}", (w - 0.1, d - 0.03, 0.035), (0, -0.01, z + 0.0175), "wood_dark", bev=0.005))
        shelves.append(round(z + 0.035, 3))
    o = join(parts, "Bookshelf")
    finalize(o, "Bookshelf", surface="wood")
    o["shelves"] = ",".join(str(s) for s in shelves[:-1])
    o["shelfWidth"] = w - 0.14
    o["shelfDepth"] = d - 0.05
    collider_box("Bookshelf", 0, (w, d, h + 0.1), (0, 0, h / 2))


def build_book():
    cover = bx("bk", (0.05, 0.22, 0.3), (0, 0, 0.15), "leather", bev=0.008, seg=2)
    pages = bx("bkp", (0.04, 0.205, 0.285), (0, -0.01, 0.15), "plaster_worn__paper", bev=0.0)
    o = join([cover, pages], "Book")
    finalize(o, "Book", surface="wood", smooth_angle=60)


def build_table():
    top = bx("tt", (2.2, 1.0, 0.08), (0, 0, 0.78), "wood_dark", bev=0.012)
    legs = []
    prof = [(0.0, 0.0), (0.05, 0.0), (0.05, 0.08), (0.035, 0.12), (0.045, 0.35), (0.03, 0.55), (0.04, 0.7), (0.05, 0.74), (0.0, 0.74)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            l = lathe(f"tl{sx}{sy}", prof, 10, "wood_dark")
            l.location = (sx * 0.98, sy * 0.4, 0)
            apply_transform(l)
            legs.append(l)
    apron = bx("ta", (2.0, 0.8, 0.1), (0, 0, 0.69), "wood_dark", bev=0.006)
    o = join([top, apron, *legs], "Table")
    finalize(o, "Table", surface="wood")
    make_lods(o, (0.4,))
    collider_box("Table", 0, (2.2, 1.0, 0.82), (0, 0, 0.41))


def build_chair():
    seat = bx("cs", (0.46, 0.44, 0.05), (0, 0, 0.46), "wood_dark", bev=0.008)
    legs = [bx(f"cl{i}", (0.045, 0.045, 0.46), (sx * 0.19, sy * 0.18, 0.23), "wood_dark", bev=0.006) for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    back = [bx(f"cb{i}", (0.045, 0.045, 0.55), (s * 0.19, 0.18, 0.46 + 0.275), "wood_dark", bev=0.006) for i, s in enumerate((-1, 1))]
    slats = [bx(f"cz{i}", (0.38, 0.03, 0.06), (0, 0.18, 0.66 + i * 0.14), "wood_dark", bev=0.006) for i in range(3)]
    o = join([seat, *legs, *back, *slats], "Chair")
    finalize(o, "Chair", surface="wood")
    collider_box("Chair", 0, (0.46, 0.44, 1.0), (0, 0, 0.5))


def build_bench():
    seat = bx("bns", (1.8, 0.42, 0.08), (0, 0, 0.45), "wood_dark", bev=0.01)
    legs = [bx(f"bnl{i}", (0.08, 0.36, 0.41), (s * 0.75, 0, 0.205), "wood_dark", bev=0.01) for i, s in enumerate((-1, 1))]
    o = join([seat, *legs], "Bench")
    finalize(o, "Bench", surface="wood")
    collider_box("Bench", 0, (1.8, 0.42, 0.5), (0, 0, 0.25))


def build_bed():
    frame = bx("bdf", (1.1, 2.1, 0.28), (0, 0, 0.3), "wood_dark", bev=0.015)
    legs = [bx(f"bdl{i}", (0.08, 0.08, 0.2), (sx * 0.5, sy * 1.0, 0.1), "wood_dark") for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    head = bx("bdh", (1.16, 0.08, 1.05), (0, 1.03, 0.62), "wood_dark", bev=0.02)
    foot = bx("bdft", (1.16, 0.08, 0.62), (0, -1.03, 0.4), "wood_dark", bev=0.02)
    mattress = bx("bdm", (1.0, 1.95, 0.2), (0, 0, 0.54), "fabric__linen", bev=0.06, seg=3)
    pillow = bx("bdp", (0.72, 0.36, 0.14), (0, 0.72, 0.7), "fabric__linen", bev=0.06, seg=3)
    blanket = bx("bdb", (1.06, 1.25, 0.06), (0, -0.33, 0.66), "fabric__azure", bev=0.025, seg=2)
    o = join([frame, *legs, head, foot, mattress, pillow, blanket], "Bed")
    finalize(o, "Bed", surface="wood", smooth_angle=50)
    collider_box("Bed", 0, (1.16, 2.14, 0.72), (0, 0, 0.36))


def build_chest():
    body = bx("chb", (0.9, 0.55, 0.45), (0, 0, 0.225), "wood_dark", bev=0.012)
    lid = cylinder("chl", 0.275, 0.9, (0, 0, 0), segments=16)
    lid.rotation_euler = (0, math.pi / 2, 0)
    lid.scale = (1, 1, 1)
    lid.location = (0, 0, 0.45)
    apply_transform(lid)
    cutter = box("chlc", (1.2, 1.0, 0.6), (0, 0, 0.45 - 0.3))
    boolean_diff(lid, cutter)
    assign(lid, "wood_dark")
    bands = [bx(f"chband{i}", (0.06, 0.57, 0.47), (x, 0, 0.235), "bronze", bev=0.005) for i, x in enumerate((-0.32, 0.32))]
    lock = bx("chlock", (0.12, 0.04, 0.14), (0, -0.285, 0.4), "bronze", bev=0.005)
    o = join([body, lid, *bands, lock], "Chest")
    finalize(o, "Chest", surface="wood", smooth_angle=45)
    collider_box("Chest", 0, (0.9, 0.55, 0.72), (0, 0, 0.36))


def build_urn():
    prof = [(0.0, 0.0), (0.12, 0.0), (0.13, 0.03), (0.1, 0.06), (0.2, 0.2), (0.26, 0.4), (0.24, 0.55), (0.14, 0.7), (0.09, 0.78), (0.1, 0.84), (0.13, 0.86), (0.12, 0.88), (0.08, 0.86), (0.0, 0.8)]
    o = lathe("urn", prof, 28, "sandglass__clay")
    finalize(o, "Urn", surface="stone", smooth_angle=60, uv="cyl", uv_radius=0.2)
    collider_cyl("Urn", 0, 0.24, 0.86, (0, 0, 0.43))


def build_crate():
    body = bx("cr", (0.7, 0.7, 0.7), (0, 0, 0.35), "wood_dark", bev=0.02)
    straps = [bx(f"crs{i}", (0.72, 0.72, 0.06), (0, 0, z), "wood_dark", bev=0.01) for i, z in enumerate((0.1, 0.6))]
    o = join([body, *straps], "Crate")
    finalize(o, "Crate", surface="wood")
    collider_box("Crate", 0, (0.72, 0.72, 0.7), (0, 0, 0.35))


def build_rubble(name, seed, count=9, spread=1.2, stone="sandstone_ashlar"):
    rnd = random.Random(seed)
    parts = []
    for i in range(count):
        s = rnd.uniform(0.18, 0.5)
        if rnd.random() < 0.6:
            b = bx(f"{name}_{i}", (s * rnd.uniform(1, 2), s, s * rnd.uniform(0.6, 1)), (0, 0, 0), stone, bev=0.04, seg=1)
        else:
            b = rock_blob(f"{name}_{i}", s * 0.6, seed * 31 + i, detail=1, mat=stone)
        b.rotation_euler = (rnd.uniform(0, math.pi), rnd.uniform(0, math.pi), rnd.uniform(0, math.pi))
        r = spread * math.sqrt(rnd.random())
        a = rnd.uniform(0, 2 * math.pi)
        b.location = (r * math.cos(a), r * math.sin(a), s * 0.3)
        apply_transform(b)
        parts.append(b)
    o = join(parts, name)
    # sink everything so nothing floats
    minz = min(v.co.z for v in o.data.vertices)
    for v in o.data.vertices:
        v.co.z -= minz + 0.05
    finalize(o, name, smooth_angle=30)
    make_lods(o, (0.4,))
    # A low mound you walk over (or around, where it's tall), not through.
    collider_hull(name, 0, o)


def build_brazier():
    bowl = lathe("brz", [(0.0, 0.8), (0.1, 0.8), (0.32, 0.92), (0.42, 1.08), (0.44, 1.12), (0.4, 1.12), (0.3, 0.98), (0.0, 0.94)], 28, "bronze")
    stem = lathe("brzs", [(0.0, 0.0), (0.26, 0.0), (0.26, 0.05), (0.1, 0.12), (0.06, 0.4), (0.08, 0.6), (0.05, 0.8), (0.0, 0.8)], 18, "bronze")
    coals = cylinder("brzc", 0.3, 0.06, (0, 0, 1.0), segments=16, mat="glow__embers")
    o = join([bowl, stem, coals], "Brazier")
    finalize(o, "Brazier", surface="metal", smooth_angle=60, uv="cyl", uv_radius=0.3)
    o["socket_fire"] = "0,1.08,0"
    collider_cyl("Brazier", 0, 0.3, 1.1, (0, 0, 0.55))


def build_wall_torch():
    plate = bx("wtp", (0.16, 0.04, 0.3), (0, 0.0, 0.0), "bronze", bev=0.008)
    arm = bx("wta", (0.04, 0.3, 0.04), (0, -0.15, 0.05), "bronze", bev=0.005)
    cup = lathe("wtc", [(0.0, 0.0), (0.05, 0.0), (0.09, 0.12), (0.1, 0.14), (0.0, 0.1)], 16, "bronze")
    cup.location = (0, -0.3, 0.05)
    apply_transform(cup)
    o = join([plate, arm, cup], "WallTorch")
    finalize(o, "WallTorch", surface="metal", smooth_angle=60)
    o["socket_fire"] = "0,0.2,0.3"


def build_armillary():
    rings = []
    for i, (rx, ry) in enumerate([(0, 0), (math.pi / 2, 0), (math.pi / 2, math.pi / 2), (0.41, 0.3)]):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.55 - i * 0.04, minor_radius=0.018, major_segments=48, minor_segments=8)
        t = bpy.context.view_layer.objects.active
        t.name = f"arm{i}"
        t.rotation_euler = (rx, ry, 0)
        t.location = (0, 0, 1.55)
        apply_transform(t)
        assign(t, "gold" if i == 3 else "bronze")
        rings.append(t)
    core = lathe("armc", [(0.0, 1.45), (0.08, 1.5), (0.1, 1.55), (0.08, 1.6), (0.0, 1.65)], 16, "gold")
    stand = lathe("arms", [(0.0, 0.0), (0.36, 0.0), (0.36, 0.08), (0.14, 0.16), (0.06, 0.5), (0.08, 0.9), (0.04, 1.0), (0.0, 1.0)], 20, "bronze")
    bpy.ops.mesh.primitive_torus_add(major_radius=0.6, minor_radius=0.025, major_segments=48, minor_segments=8)
    mer = bpy.context.view_layer.objects.active
    mer.rotation_euler = (math.pi / 2, 0, 0)
    mer.location = (0, 0, 1.55)
    apply_transform(mer)
    assign(mer, "bronze")
    yoke = bx("army", (0.05, 0.05, 0.55), (0, 0, 1.0 + 0.2), "bronze", bev=0.0)
    o = join([*rings, core, stand, mer, yoke], "Armillary")
    finalize(o, "Armillary", surface="metal", smooth_angle=70)
    make_lods(o, (0.35,))
    collider_cyl("Armillary", 0, 0.36, 1.2, (0, 0, 0.6))


def build_lectern():
    base = lathe("lcb", [(0.0, 0.0), (0.28, 0.0), (0.28, 0.06), (0.08, 0.14), (0.06, 0.9), (0.1, 0.95), (0.0, 0.95)], 16, "wood_dark")
    top = bx("lct", (0.62, 0.46, 0.05), (0, 0, 1.05), "wood_dark", bev=0.01)
    top.rotation_euler = (-0.35, 0, 0)
    apply_transform(top)
    lip = bx("lcl", (0.62, 0.04, 0.05), (0, -0.23, 0.97), "wood_dark", bev=0.006)
    o = join([base, top, lip], "Lectern")
    finalize(o, "Lectern", surface="wood", smooth_angle=50)
    o["socket_book"] = "0,1.1,0.02"
    collider_box("Lectern", 0, (0.6, 0.5, 1.1), (0, 0, 0.55))


def build_banner():
    bm = bmesh.new()
    cols, rows = 6, 14
    w, h = 1.2, 3.2
    grid = []
    for r in range(rows + 1):
        z = -h * r / rows
        row = []
        for c in range(cols + 1):
            x = -w / 2 + w * c / cols
            # swallowtail bottom edge
            if r == rows:
                z = -h + 0.35 * (1 - abs((c / cols) * 2 - 1))
            row.append(bm.verts.new((x, 0.0, z)))
        grid.append(row)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    o = mesh_object("banner", bm)
    assign(o, "fabric__crimson")
    rod = cylinder("bnr", 0.025, 1.4, (0, 0, 0.03), segments=10, mat="bronze")
    rod.rotation_euler = (0, math.pi / 2, 0)
    apply_transform(rod)
    o = join([o, rod], "Banner")
    finalize(o, "Banner", surface="cloth", smooth_angle=80)
    o["cloth"] = 1


def build_statue():
    """Robed, hooded sage figure with a staff (stylised)."""
    robe = lathe("sr", [(0.0, 0.0), (0.62, 0.0), (0.6, 0.1), (0.48, 0.6), (0.38, 1.2), (0.34, 1.6), (0.42, 1.95), (0.36, 2.15), (0.2, 2.3), (0.0, 2.32)], 24, "limestone_smooth")
    for v in robe.data.vertices:
        # flatten front/back a little and add drapery folds
        a = math.atan2(v.co.y, v.co.x)
        fold = 1 + 0.05 * math.sin(a * 7) * max(0.0, 1.0 - v.co.z / 1.6)
        v.co.x *= fold
        v.co.y *= 0.8 * fold
    hood = lathe("sh", [(0.0, 2.2), (0.2, 2.22), (0.24, 2.4), (0.22, 2.58), (0.13, 2.72), (0.0, 2.75)], 20, "limestone_smooth")
    face_cut = box("shc", (0.3, 0.3, 0.34), (0, -0.2, 2.45))
    boolean_diff(hood, face_cut, solver="FAST")
    face = lathe("sf", [(0.0, 2.3), (0.12, 2.34), (0.14, 2.46), (0.1, 2.58), (0.0, 2.6)], 16, "dark")
    face.location.y = -0.02
    apply_transform(face)
    staff = cylinder("sst", 0.035, 3.1, (0.46, -0.18, 1.55), segments=10, mat="bronze")
    orb = lathe("sorb", [(0.0, 3.05), (0.1, 3.1), (0.12, 3.2), (0.1, 3.3), (0.0, 3.35)], 16, "gold")
    orb.location = (0.46, -0.18, 0)
    apply_transform(orb)
    arm = cylinder("sarm", 0.1, 0.62, (0.3, -0.12, 1.75), segments=12, mat="limestone_smooth")
    arm.rotation_euler = (0.3, -0.9, 0)
    arm.location = (0.3, -0.14, 1.72)
    apply_transform(arm)
    plinth = bx("spl", (1.5, 1.5, 0.4), (0, 0, -0.2), "sandstone_ashlar", bev=0.03)
    parts = [robe, hood, face, staff, orb, arm, plinth]
    for p in parts:
        p.location.z += 0.4
        apply_transform(p)
    o = join(parts, "Statue_Sage")
    finalize(o, "Statue_Sage", smooth_angle=55)
    make_lods(o, (0.4, 0.15))
    collider_box("Statue_Sage", 0, (1.5, 1.5, 0.4), (0, 0, 0.2))
    collider_cyl("Statue_Sage", 1, 0.6, 2.8, (0, 0, 1.8))


def faceted_rock(name, radius, seed, squash, cuts=9):
    """Desert rock: displaced sphere chiselled by random fracture planes."""
    rnd = random.Random(seed)
    o = rock_blob(name, radius, seed, detail=3, squash=squash, roughness=0.22, mat="rock")
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for _ in range(cuts):
        nrm = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1))).normalized()
        dist = radius * rnd.uniform(0.55, 0.85) * (squash[2] if nrm.z > 0.6 else 1.0)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=nrm * dist, plane_no=nrm, clear_outer=True)
        edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(o.data)
    bm.free()
    return o


def build_rocks():
    specs = [(1.2, (1.3, 1.0, 0.75), 5), (2.2, (1.0, 1.4, 0.65), 17), (0.6, (1, 1, 0.8), 23), (3.5, (1.6, 1.1, 0.6), 41)]
    for i, (r, sq, seed) in enumerate(specs):
        name = f"Rock_{'ABCD'[i]}"
        o = faceted_rock(name, r, seed, sq)
        minz = min(v.co.z for v in o.data.vertices)
        for v in o.data.vertices:
            v.co.z -= minz + r * 0.15
        finalize(o, name, smooth_angle=28)
        make_lods(o, (0.45, 0.2))
        collider_hull(name, 0, o)


def build_carriage():
    """Dragon carriage: box cabin with canvas roof, spoked wheels, shafts."""
    parts = []
    parts.append(bx("cab", (1.9, 3.4, 1.5), (0, 0, 1.45), "wood_dark", bev=0.03))
    parts.append(bx("cabrim", (2.0, 3.5, 0.12), (0, 0, 0.7), "wood_dark", bev=0.02))
    parts.append(bx("cabtop", (2.0, 3.5, 0.1), (0, 0, 2.22), "wood_dark", bev=0.02))
    roof = cylinder("roof", 1.02, 3.5, (0, 0, 0), segments=24, mat="fabric__canvas")
    roof.rotation_euler = (math.pi / 2, 0, 0)
    roof.scale = (1, 0.55, 1)
    roof.location = (0, 0, 2.2)
    apply_transform(roof)
    cut = box("roofcut", (3, 4, 2), (0, 0, 2.2 - 1.0))
    boolean_diff(roof, cut)
    parts.append(roof)
    for i, y in enumerate((-1.2, 0.0, 1.2)):
        parts.append(bx(f"rib{i}", (2.1, 0.08, 0.08), (0, y, 2.22), "bronze", bev=0.01))
    # windows and door (dark insets)
    for s in (-1, 1):
        parts.append(bx(f"win{s}", (0.04, 0.8, 0.5), (s * 0.95, -0.7, 1.7), "dark", bev=0.0))
        parts.append(bx(f"winf{s}", (0.06, 0.92, 0.08), (s * 0.96, -0.7, 1.98), "wood_dark", bev=0.01))
    parts.append(bx("door", (0.04, 0.8, 1.2), (0.95, 0.8, 1.35), "wood_dark", bev=0.01))
    parts.append(bx("step", (0.4, 0.7, 0.06), (1.15, 0.8, 0.5), "wood_dark", bev=0.01))
    # wheels
    for sx in (-1, 1):
        for sy in (-1.1, 1.1):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.06, major_segments=32, minor_segments=8)
            rim = bpy.context.view_layer.objects.active
            rim.rotation_euler = (0, math.pi / 2, 0)
            rim.location = (sx * 1.08, sy, 0.66)
            apply_transform(rim)
            assign(rim, "wood_dark")
            parts.append(rim)
            hub = cylinder(f"hub{sx}{sy}", 0.12, 0.2, (0, 0, 0), segments=12, mat="bronze")
            hub.rotation_euler = (0, math.pi / 2, 0)
            hub.location = (sx * 1.08, sy, 0.66)
            apply_transform(hub)
            parts.append(hub)
            for k in range(8):
                sp = bx(f"sp{sx}{sy}{k}", (0.04, 0.04, 1.2), (0, 0, 0), "wood_dark", bev=0.0)
                sp.rotation_euler = (k * math.pi / 8, 0, 0)
                sp.location = (sx * 1.08, sy, 0.66)
                apply_transform(sp)
                parts.append(sp)
    parts.append(bx("axf", (2.2, 0.1, 0.1), (0, -1.1, 0.66), "wood_dark", bev=0.0))
    parts.append(bx("axb", (2.2, 0.1, 0.1), (0, 1.1, 0.66), "wood_dark", bev=0.0))
    # shafts toward the (absent) land dragon, front = -Y
    for s in (-1, 1):
        sh = bx(f"shaft{s}", (0.08, 2.8, 0.08), (s * 0.55, -3.0, 0.8), "wood_dark", bev=0.01)
        sh.rotation_euler = (0.1, 0, 0)
        apply_transform(sh)
        parts.append(sh)
    parts.append(bx("seat", (1.6, 0.5, 0.1), (0, -1.95, 1.2), "wood_dark", bev=0.02))
    parts.append(bx("lantern", (0.16, 0.16, 0.24), (0.95, -1.8, 2.05), "glow__lantern", bev=0.01))
    o = join(parts, "Carriage")
    finalize(o, "Carriage", surface="wood", smooth_angle=45)
    make_lods(o, (0.4, 0.15))
    o["socket_lantern"] = "0.95,2.05,1.8"
    collider_box("Carriage", 0, (2.0, 3.5, 2.0), (0, 0, 1.25))


def build_campfire():
    parts = []
    rnd = random.Random(4)
    for i in range(10):
        a = i / 10 * 2 * math.pi
        s = rock_blob(f"cf{i}", 0.16 + rnd.uniform(-0.03, 0.04), 100 + i, detail=1, mat="rock")
        s.location = (math.cos(a) * 0.62, math.sin(a) * 0.62, 0.05)
        apply_transform(s)
        parts.append(s)
    for i in range(4):
        lg = cylinder(f"log{i}", 0.07, 0.9, (0, 0, 0), segments=8, mat="wood_dark")
        lg.rotation_euler = (math.pi / 2 - 0.35, 0, i * math.pi / 2 + 0.3)
        lg.location = (0, 0, 0.2)
        apply_transform(lg)
        parts.append(lg)
    embers = cylinder("emb", 0.35, 0.04, (0, 0, 0.02), segments=16, mat="glow__embers")
    parts.append(embers)
    o = join(parts, "Campfire")
    finalize(o, "Campfire", surface="stone", smooth_angle=40)
    o["socket_fire"] = "0,0.25,0"
    collider_cyl("Campfire", 0, 0.78, 0.6, (0, 0, 0.3))


def build_tent():
    bm = bmesh.new()
    w, d, h = 2.4, 2.8, 1.8
    v = [bm.verts.new(p) for p in [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (0, -d / 2, h), (-w / 2, d / 2, 0), (w / 2, d / 2, 0), (0, d / 2, h)]]
    bm.faces.new((v[0], v[3], v[5], v[2]))
    bm.faces.new((v[1], v[2], v[5], v[4]))
    bm.faces.new((v[3], v[4], v[5]))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=4, use_grid_fill=True)
    for vert in bm.verts:
        if 0.05 < vert.co.z < h - 0.05:
            vert.co.z -= 0.06 * math.sin(math.pi * vert.co.z / h)
    o = mesh_object("tent", bm)
    assign(o, "fabric__canvas")
    pole = cylinder("tp", 0.03, d + 0.2, (0, 0, 0), segments=8, mat="wood_dark")
    pole.rotation_euler = (math.pi / 2, 0, 0)
    pole.location = (0, 0, h)
    apply_transform(pole)
    o = join([o, pole], "Tent")
    finalize(o, "Tent", surface="cloth", smooth_angle=60)
    collider_box("Tent", 0, (w, d, h * 0.7), (0, 0, h * 0.35))


def build_step_block():
    """Single spiral-stair tread (instanced along a helix by the engine)."""
    o = bx("tread", (2.6, 0.62, 0.22), (1.3 + 0.3, 0, -0.11), "limestone_smooth", bev=0.015)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for v in bm.verts:
        # taper toward the core so treads fan around the helix
        k = 0.55 + 0.45 * ((v.co.x - 0.3) / 2.6)
        v.co.y *= max(0.4, k)
    bm.to_mesh(o.data)
    bm.free()
    finalize(o, "SpiralTread")


def main():
    reset_scene()
    builders = [
        build_wall, build_wall_window, build_wall_door, build_floor,
        lambda: build_column("Column_6", 6.0), lambda: build_column("Column_Broken", 6.0, broken_at=2.7),
        build_column_drum, build_arch, build_stairs, build_balustrade, build_pedestal,
        lambda: build_ruin_wall("RuinWall_A", 6.0, 2.6, 3), lambda: build_ruin_wall("RuinWall_B", 4.0, 1.6, 8),
        build_obelisk, build_fallen_giant,
        build_bookshelf, build_book, build_table, build_chair, build_bench, build_bed, build_chest,
        build_urn, build_crate,
        lambda: build_rubble("Rubble_A", 1), lambda: build_rubble("Rubble_B", 2, 14, 1.8), lambda: build_rubble("Rubble_Small", 3, 5, 0.6),
        build_brazier, build_wall_torch, build_armillary, build_lectern, build_banner, build_statue,
        build_rocks, build_carriage, build_campfire, build_tent, build_step_block,
    ]
    for b in builders:
        name = getattr(b, "__name__", "piece")
        try:
            b()
        except Exception as exc:  # keep building the rest; report clearly
            print(f"!! {name} failed: {exc}")
            raise
    # Hide collision proxies from rendering in any viewer; engine reads them by name.
    export_glb(OUT)
    s = stats()
    print(f"kit: {s['pieces']} pieces, {s['tris']} triangles total → {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

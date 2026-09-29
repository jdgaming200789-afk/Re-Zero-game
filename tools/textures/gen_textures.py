"""Generate the tileable PBR material library for Re:Zero - Pleiades.

Each material produces three WebP maps in public/assets/textures/<name>/:
  albedo.webp  sRGB base colour
  normal.webp  tangent-space normal (OpenGL, +Y up)
  orm.webp     R = ambient occlusion, G = roughness, B = metalness (glTF packing)

plus public/assets/textures/materials.json describing them for the engine.

Usage:  python tools/textures/gen_textures.py [--size 1024] [name ...]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from noise import (  # noqa: E402
    blur,
    cavity_ao,
    colorize,
    fbm,
    hex_rgb,
    lerp,
    normal_from_height,
    perlin,
    ridged,
    smoothstep,
    voronoi,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "textures")


# --------------------------------------------------------------------------- helpers
def grid(size):
    c = (np.arange(size) + 0.5) / size
    return np.meshgrid(c, c, indexing="xy")


def ashlar_layout(size, rows, seed, min_w, max_w):
    """Running-bond stone courses. Returns (block_id, edge_dist, u, v) in tile units."""
    rng = np.random.default_rng(seed)
    x, y = grid(size)
    row = np.minimum((y * rows).astype(int), rows - 1)
    row_h = 1.0 / rows
    block_id = np.zeros((size, size), dtype=np.int64)
    edge = np.zeros((size, size))
    u = np.zeros((size, size))
    v = (y - row * row_h) / row_h
    for r in range(rows):
        # Course boundaries must be periodic mod 1 so the texture tiles:
        # start at -offset, then rescale widths so the course ends at 1 - offset.
        offset = rng.uniform(0, max_w)
        widths = []
        while sum(widths) < 1.0:
            widths.append(rng.uniform(min_w, max_w))
        widths = np.array(widths) / sum(widths)
        b = -offset + np.concatenate([[0.0], np.cumsum(widths)])
        mask = row == r
        xs = x[mask]
        xs = np.where(xs >= b[-1], xs - 1.0, xs)
        idx = np.clip(np.searchsorted(b, xs, side="right") - 1, 0, len(b) - 2)
        left = b[idx]
        right = b[idx + 1]
        block_id[mask] = r * 1000 + idx
        lx = xs - left
        rx = right - xs
        ly = v[mask] * row_h
        ry = row_h - ly
        edge[mask] = np.minimum(np.minimum(lx, rx), np.minimum(ly, ry))
        u[mask] = lx / (right - left)
    return block_id, edge, u, v


def per_id_random(ids, seed):
    """Deterministic pseudo-random value in [-1, 1] per integer id."""
    h = (ids.astype(np.uint64) * np.uint64(2654435761) + np.uint64(seed * 97 + 13)) % np.uint64(2**32)
    h ^= h >> np.uint64(13)
    h = (h * np.uint64(1274126177)) % np.uint64(2**32)
    return (h.astype(np.float64) / 2**32) * 2 - 1


def finish(name, albedo, height, rough, metal, ao, normal_strength, meta):
    size = albedo.shape[0]
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    alb = np.clip(albedo, 0, 1)
    Image.fromarray((alb * 255 + 0.5).astype(np.uint8), "RGB").save(os.path.join(d, "albedo.webp"), quality=90, method=6)
    n = normal_from_height(height, normal_strength * size / 1024)
    Image.fromarray((n * 255 + 0.5).astype(np.uint8), "RGB").save(os.path.join(d, "normal.webp"), quality=94, method=6)
    orm = np.stack([np.clip(ao, 0, 1), np.clip(rough, 0.03, 1), np.clip(metal, 0, 1)], axis=-1)
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8), "RGB").save(os.path.join(d, "orm.webp"), quality=90, method=6)
    meta = dict(meta)
    meta["name"] = name
    return meta


# --------------------------------------------------------------------------- materials
def sandstone_ashlar(size, seed=11):
    """Pale warm tower masonry: running-bond courses, worn arrises, stains."""
    ids, edge, u, v = ashlar_layout(size, rows=5, seed=seed, min_w=0.22, max_w=0.45)
    rb = per_id_random(ids, seed)
    rb2 = per_id_random(ids, seed + 7)
    mortar = 0.0022
    bevel = 0.012
    face = smoothstep(mortar, mortar + bevel, edge)
    n_fine = fbm(size, 16, seed + 1, 5, 0.55)
    n_mid = fbm(size, 6, seed + 2, 4, 0.5)
    chips = ridged(size, 12, seed + 3, 3)
    # Erode arrises where noise says so (chipped edges)
    erosion = smoothstep(0.55, 0.9, chips) * (1 - smoothstep(0.0, 0.05, edge))
    tilt = (u - 0.5) * rb * 0.03 + (v - 0.5) * rb2 * 0.03
    height = face * (0.85 + tilt + n_fine * 0.05 + n_mid * 0.04) - erosion * 0.35 * face
    height += (1 - face) * (n_fine * 0.03)

    base = colorize("#cbb99a", rb * 0.9 + n_mid * 0.5, "#dccdb2", "#ae987a", 0.45)
    stains = smoothstep(0.1, 0.7, fbm(size, 4, seed + 4, 5, 0.6))
    base = lerp(base, hex_rgb("#9c8a6f")[None, None, :], stains[..., None] * 0.28)
    # vertical rain/dust streaks within courses
    streak = blur(fbm(size, 24, seed + 5, 3, 0.5), 1)
    base *= (1 - 0.06 * np.clip(streak, 0, 1))[..., None]
    mortar_col = hex_rgb("#b8aa93")
    albedo = lerp(mortar_col[None, None, :], base, face[..., None])
    albedo *= (0.9 + 0.1 * (1 - erosion))[..., None]
    albedo += (n_fine * 0.035)[..., None]
    rough = 0.84 + n_fine * 0.06 + (1 - face) * 0.08
    ao = cavity_ao(height, 5, 1.6) * (0.88 + 0.12 * face)
    return albedo, height, rough, np.zeros_like(rough), ao, 5.0, {"tileMeters": 4.0, "normalScale": 1.0}


def limestone_smooth(size, seed=21):
    """Dressed pale stone for columns, trims and statues."""
    n1 = fbm(size, 4, seed, 6, 0.55)
    n2 = fbm(size, 20, seed + 1, 4, 0.5)
    pits = smoothstep(0.72, 0.95, ridged(size, 28, seed + 2, 2))
    height = n1 * 0.05 + n2 * 0.03 - pits * 0.06
    albedo = colorize("#d9cdb6", n1 * 1.2, "#e3d9c5", "#c8b89c", 0.35)
    albedo *= (1 - pits * 0.08)[..., None]
    rough = 0.72 + n2 * 0.08 + pits * 0.1
    ao = cavity_ao(height, 4, 3.0)
    return albedo, height, rough, np.zeros_like(rough), ao, 6.0, {"tileMeters": 3.0, "normalScale": 1.0}


def marble_tiles(size, seed=31):
    """Worn blue-grey marble floor, 2×2 tiles per texture repeat, thin gold-dark grout."""
    x, y = grid(size)
    tiles = 2
    tx = (x * tiles) % 1
    ty = (y * tiles) % 1
    tid = (np.floor(y * tiles) * tiles + np.floor(x * tiles)).astype(np.int64)
    edge = np.minimum(np.minimum(tx, 1 - tx), np.minimum(ty, 1 - ty)) / tiles
    grout = 1 - smoothstep(0.002, 0.005, edge)
    warp = fbm(size, 3, seed, 4, 0.5)
    vein_a = ridged(size, 3, seed + 1, 5)
    vein_b = ridged(size, 5, seed + 2, 5)
    alt = (per_id_random(tid, seed) > 0)
    veins = np.where(alt, vein_a, vein_b)
    veins = smoothstep(0.82, 0.98, veins + warp * 0.05)
    cloud = fbm(size, 6, seed + 3, 5, 0.55)
    tint = per_id_random(tid, seed + 9)
    base = colorize("#b8bcc4", cloud + tint * 0.5, "#cfd2d8", "#8e949f", 0.6)
    albedo = lerp(base, hex_rgb("#5d6470")[None, None, :], veins[..., None] * 0.55)
    albedo = lerp(albedo, hex_rgb("#6b5b3e")[None, None, :], grout[..., None])
    scuff = smoothstep(0.2, 0.8, fbm(size, 8, seed + 4, 4, 0.6))
    height = -grout * 0.3 + cloud * 0.01 - scuff * 0.004
    rough = 0.22 + scuff * 0.35 + grout * 0.5 + veins * 0.05
    ao = cavity_ao(height, 3, 2.0)
    return albedo, height, rough, np.zeros_like(rough), ao, 10.0, {"tileMeters": 2.0, "normalScale": 1.0}


def flagstone(size, seed=41):
    """Irregular paving slabs with sand in the joints (plazas, terraces)."""
    f1, f2, cid = voronoi(size, 5, seed, 0.85)
    gap = f2 - f1
    face = smoothstep(0.03, 0.09, gap)
    rid = per_id_random(cid, seed)
    n = fbm(size, 10, seed + 1, 5, 0.55)
    wear = fbm(size, 4, seed + 2, 4, 0.5)
    height = face * (0.8 + rid * 0.05 + n * 0.06 - f1 * 0.05) + (1 - face) * (n * 0.03 - 0.1)
    stone = colorize("#b9a88c", rid + wear * 0.5, "#cdbfa5", "#968468", 0.6)
    sand = colorize("#cfb07e", n, "#dcc097", "#b8955f", 0.4)
    albedo = lerp(sand, stone, face[..., None])
    albedo += (n * 0.03)[..., None]
    rough = lerp(0.95, 0.8, face) + n * 0.04
    ao = cavity_ao(height, 6, 2.2)
    return albedo, height, rough, np.zeros_like(rough), ao, 8.0, {"tileMeters": 5.0, "normalScale": 1.0}


def sand(size, seed=51):
    """Dune sand: wind ripples and fine grain."""
    x, y = grid(size)
    warp = fbm(size, 3, seed, 4, 0.5)
    ripples = np.sin((y * 14 + warp * 1.6 + x * 0.0) * 2 * np.pi)
    ripples = np.sign(ripples) * np.abs(ripples) ** 0.7
    grain = fbm(size, 64, seed + 1, 3, 0.6)
    patches = fbm(size, 4, seed + 2, 5, 0.55)
    height = ripples * 0.05 + grain * 0.012 + patches * 0.04
    albedo = colorize("#d6b88a", patches * 1.2 + ripples * 0.12, "#e3c99f", "#b99666", 0.55)
    albedo += (grain * 0.05)[..., None]
    rough = 0.93 + grain * 0.04
    ao = cavity_ao(height, 4, 1.5)
    return albedo, height, rough, np.zeros_like(rough), ao, 22.0, {"tileMeters": 6.0, "normalScale": 1.0}


def sandglass(size, seed=61):
    """Sand fused to glass by centuries of white light: glossy, cracked, amber-smoke."""
    f1, f2, cid = voronoi(size, 7, seed, 0.95)
    cracks = 1 - smoothstep(0.0, 0.035, f2 - f1)
    swirl = fbm(size, 4, seed + 1, 5, 0.55)
    bubbles = smoothstep(0.75, 0.95, ridged(size, 30, seed + 2, 2))
    rid = per_id_random(cid, seed)
    height = swirl * 0.06 + rid * 0.03 - cracks * 0.25 - bubbles * 0.03
    base = colorize("#6a5b44", swirl + rid * 0.6, "#8c7a58", "#3e342a", 0.7)
    albedo = lerp(base, hex_rgb("#2a231b")[None, None, :], cracks[..., None] * 0.7)
    albedo = lerp(albedo, hex_rgb("#c9b48a")[None, None, :], (smoothstep(0.4, 0.9, swirl) * 0.25)[..., None])
    rough = 0.08 + cracks * 0.6 + smoothstep(0.3, 0.9, fbm(size, 8, seed + 3, 4, 0.5)) * 0.25
    ao = cavity_ao(height, 3, 2.0)
    return albedo, height, rough, np.zeros_like(rough), ao, 14.0, {"tileMeters": 6.0, "normalScale": 1.0}


def bronze(size, seed=71):
    """Aged bronze with verdigris in recesses."""
    n = fbm(size, 8, seed, 6, 0.55)
    cav = fbm(size, 16, seed + 1, 4, 0.5)
    patina = smoothstep(0.1, 0.6, cav + n * 0.4)
    height = n * 0.03 + cav * 0.02
    metal_col = colorize("#b88a48", n, "#d4a660", "#8a6230", 0.6)
    albedo = lerp(metal_col, hex_rgb("#5b9a82")[None, None, :], patina[..., None] * 0.75)
    rough = lerp(0.32, 0.8, patina) + n * 0.05
    metal = lerp(1.0, 0.15, patina)
    ao = cavity_ao(height, 3, 3.0)
    return albedo, height, rough, metal, ao, 10.0, {"tileMeters": 1.5, "normalScale": 1.0}


def wood_dark(size, seed=81):
    """Old dark hardwood planks (furniture, shelves, doors)."""
    x, y = grid(size)
    planks = 4
    py = (y * planks) % 1
    pid = np.floor(y * planks).astype(np.int64)
    seam = 1 - smoothstep(0.004, 0.012, np.minimum(py, 1 - py) / planks)
    warp = fbm(size, 4, seed, 4, 0.5)
    rid = per_id_random(pid, seed)
    grain = np.sin((y * 90 + warp * 3 + rid * 7 + x * 2) * 2 * np.pi) * 0.5 + 0.5
    fine = fbm(size, 48, seed + 1, 3, 0.5)
    height = grain * 0.02 + fine * 0.01 - seam * 0.2
    base = colorize("#4a3222", rid * 0.8 + warp * 0.4, "#5e4230", "#34221a", 0.6)
    albedo = base * (0.85 + 0.15 * grain)[..., None]
    albedo = lerp(albedo, hex_rgb("#1b120c")[None, None, :], seam[..., None])
    rough = 0.62 + grain * 0.1 + seam * 0.2
    ao = cavity_ao(height, 3, 2.0)
    return albedo, height, rough, np.zeros_like(rough), ao, 10.0, {"tileMeters": 2.0, "normalScale": 1.0}


def fabric(size, seed=91):
    """Neutral woven cloth; tinted per-use in the engine (banners, bedding, rugs)."""
    x, y = grid(size)
    f = 160
    warp_t = (np.sin(x * f * 2 * np.pi) * 0.5 + 0.5)
    weft_t = (np.sin(y * f * 2 * np.pi) * 0.5 + 0.5)
    checker = (np.floor(x * f) + np.floor(y * f)) % 2
    weave = np.where(checker > 0, warp_t, weft_t)
    n = fbm(size, 8, seed, 4, 0.5)
    height = weave * 0.3 + n * 0.1
    albedo = np.repeat((0.78 + weave * 0.12 + n * 0.08)[..., None], 3, axis=2)
    rough = 0.9 + n * 0.05
    ao = cavity_ao(height, 2, 1.5)
    return albedo, height, rough, np.zeros_like(rough), ao, 8.0, {"tileMeters": 1.0, "normalScale": 0.8, "tintable": True}


def rock(size, seed=101):
    """Weathered desert rock for ruins and outcrops."""
    r = ridged(size, 4, seed, 6)
    n = fbm(size, 12, seed + 1, 5, 0.55)
    strata = np.sin((grid(size)[1] * 18 + fbm(size, 3, seed + 2, 3, 0.5) * 2) * 2 * np.pi)
    height = r * 0.3 + n * 0.1 + strata * 0.03
    albedo = colorize("#9a856a", n + strata * 0.3, "#b39c7e", "#6e5d49", 0.6)
    albedo *= (0.8 + r * 0.25)[..., None]
    rough = 0.9 + n * 0.05
    ao = cavity_ao(height, 6, 2.0)
    return albedo, height, rough, np.zeros_like(rough), ao, 22.0, {"tileMeters": 4.0, "normalScale": 1.0}


def plaster_worn(size, seed=111):
    """Lime plaster over stone, cracked and flaking (Alcyone's living quarters)."""
    n = fbm(size, 5, seed, 6, 0.55)
    cracks = smoothstep(0.93, 0.99, ridged(size, 5, seed + 1, 4))
    flake = smoothstep(0.35, 0.5, fbm(size, 3, seed + 2, 5, 0.6))
    height = n * 0.03 - cracks * 0.15 - flake * 0.12
    plaster = colorize("#e2d6c0", n * 1.1, "#ece3d2", "#c8b89c", 0.55)
    under = colorize("#b8a282", n, "#c7b294", "#9b8466", 0.5)
    albedo = lerp(plaster, under, flake[..., None])
    albedo = lerp(albedo, hex_rgb("#6f604c")[None, None, :], cracks[..., None] * 0.8)
    rough = 0.88 + n * 0.05
    ao = cavity_ao(height, 4, 3.0)
    return albedo, height, rough, np.zeros_like(rough), ao, 14.0, {"tileMeters": 3.0, "normalScale": 1.0}


def leather(size, seed=121):
    """Book covers and straps; tinted per book."""
    f1, f2, _ = voronoi(size, 40, seed, 0.9)
    pores = smoothstep(0.0, 0.25, f2 - f1)
    n = fbm(size, 6, seed + 1, 5, 0.5)
    height = pores * 0.05 + n * 0.03
    albedo = np.repeat((0.72 + n * 0.12 + pores * 0.06)[..., None], 3, axis=2)
    rough = 0.55 + (1 - pores) * 0.15 + n * 0.05
    ao = cavity_ao(height, 2, 2.0)
    return albedo, height, rough, np.zeros_like(rough), ao, 10.0, {"tileMeters": 0.5, "normalScale": 0.8, "tintable": True}


MATERIALS = {
    "sandstone_ashlar": sandstone_ashlar,
    "limestone_smooth": limestone_smooth,
    "marble_tiles": marble_tiles,
    "flagstone": flagstone,
    "sand": sand,
    "sandglass": sandglass,
    "bronze": bronze,
    "wood_dark": wood_dark,
    "fabric": fabric,
    "rock": rock,
    "plaster_worn": plaster_worn,
    "leather": leather,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("names", nargs="*")
    args = ap.parse_args()
    names = args.names or list(MATERIALS)
    os.makedirs(OUT, exist_ok=True)
    index_path = os.path.join(OUT, "materials.json")
    index = {}
    if os.path.exists(index_path):
        with open(index_path) as f:
            index = json.load(f)
    for name in names:
        t0 = time.time()
        albedo, height, rough, metal, ao, strength, meta = MATERIALS[name](args.size)
        index[name] = finish(name, albedo, height, rough, metal, ao, strength, meta)
        print(f"{name:18s} {time.time() - t0:5.1f}s")
    with open(index_path, "w") as f:
        json.dump(dict(sorted(index.items())), f, indent=2)


if __name__ == "__main__":
    main()

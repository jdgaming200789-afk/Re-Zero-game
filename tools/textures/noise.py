"""Tileable (periodic) procedural noise and helpers for texture generation.

Everything here wraps seamlessly across the image edges so generated
materials can tile across large architecture without visible seams.
"""
from __future__ import annotations

import numpy as np


def _fade(t: np.ndarray) -> np.ndarray:
    return t * t * t * (t * (t * 6 - 15) + 10)


def perlin(size: int, period: int, seed: int) -> np.ndarray:
    """Periodic gradient noise in [-1, 1], `period` lattice cells across the image."""
    rng = np.random.default_rng(seed)
    angles = rng.uniform(0, 2 * np.pi, (period, period))
    gx, gy = np.cos(angles), np.sin(angles)
    coords = np.arange(size) * (period / size)
    x, y = np.meshgrid(coords, coords, indexing="xy")
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = x - x0
    fy = y - y0
    x0 %= period
    y0 %= period
    x1 = (x0 + 1) % period
    y1 = (y0 + 1) % period

    def dot(ix, iy, dx, dy):
        return gx[iy, ix] * dx + gy[iy, ix] * dy

    n00 = dot(x0, y0, fx, fy)
    n10 = dot(x1, y0, fx - 1, fy)
    n01 = dot(x0, y1, fx, fy - 1)
    n11 = dot(x1, y1, fx - 1, fy - 1)
    u = _fade(fx)
    v = _fade(fy)
    nx0 = n00 + u * (n10 - n00)
    nx1 = n01 + u * (n11 - n01)
    return (nx0 + v * (nx1 - nx0)) * 1.41


def fbm(size: int, period: int, seed: int, octaves: int = 5, persistence: float = 0.5) -> np.ndarray:
    """Fractal noise, roughly in [-1, 1]."""
    total = np.zeros((size, size))
    amp = 1.0
    norm = 0.0
    p = period
    for o in range(octaves):
        if p > size // 2:
            break
        total += perlin(size, p, seed + o * 101) * amp
        norm += amp
        amp *= persistence
        p *= 2
    return total / norm


def ridged(size: int, period: int, seed: int, octaves: int = 4) -> np.ndarray:
    """Ridged fractal noise in [0, 1] — good for veins and cracks."""
    return np.clip(1 - np.abs(fbm(size, period, seed, octaves, 0.55)) * 1.6, 0, 1)


def voronoi(size: int, cells: int, seed: int, jitter: float = 0.9):
    """Periodic Worley noise. Returns (F1, F2, cell_id) with distances in cell units."""
    rng = np.random.default_rng(seed)
    pts = rng.uniform(0.5 - jitter / 2, 0.5 + jitter / 2, (cells, cells, 2))
    coords = (np.arange(size) + 0.5) * (cells / size)
    x, y = np.meshgrid(coords, coords, indexing="xy")
    cx = np.floor(x).astype(int)
    cy = np.floor(y).astype(int)
    f1 = np.full((size, size), 1e9)
    f2 = np.full((size, size), 1e9)
    cid = np.zeros((size, size), dtype=np.int64)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            nx = cx + ox
            ny = cy + oy
            wx = nx % cells
            wy = ny % cells
            px = nx + pts[wy, wx, 0]
            py = ny + pts[wy, wx, 1]
            d = np.hypot(x - px, y - py)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            cid = np.where(closer, wy * cells + wx, cid)
            f1 = np.where(closer, d, f1)
    return f1, f2, cid


def blur(img: np.ndarray, radius: float) -> np.ndarray:
    """Periodic Gaussian blur via FFT (wraps, so it preserves tiling)."""
    if radius <= 0:
        return img
    h, w = img.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2 * (np.pi * radius) ** 2 * (fx**2 + fy**2))
    if img.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(img) * kernel))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(img[..., c]) * kernel)) for c in range(img.shape[2])], axis=-1)


def normal_from_height(height: np.ndarray, strength: float) -> np.ndarray:
    """Tangent-space normal map (OpenGL convention, +Y up) from a height field."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    nx = -dx * strength
    ny = dy * strength  # image rows go down; OpenGL green points up
    nz = np.ones_like(height)
    length = np.sqrt(nx**2 + ny**2 + nz**2)
    n = np.stack([nx / length, ny / length, nz / length], axis=-1)
    return n * 0.5 + 0.5


def cavity_ao(height: np.ndarray, radius: float = 6, strength: float = 2.0) -> np.ndarray:
    """Cheap ambient occlusion: how far below its blurred neighbourhood a texel is."""
    diff = height - blur(height, radius)
    return np.clip(1 + diff * strength, 0, 1)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)])


def lerp(a, b, t):
    return a + (b - a) * t


def colorize(base: str, variation: np.ndarray, tint_a: str, tint_b: str, amount: float) -> np.ndarray:
    """Base colour pushed toward two tints by a [-1,1] variation field."""
    b = hex_rgb(base)
    a = hex_rgb(tint_a)
    c = hex_rgb(tint_b)
    v = variation[..., None]
    col = np.where(v > 0, lerp(b, a, np.clip(v, 0, 1) * amount), lerp(b, c, np.clip(-v, 0, 1) * amount))
    return col

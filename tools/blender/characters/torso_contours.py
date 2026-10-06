"""Contour curves for the preserved body and the new upper-torso mesh.

Natural C2 height curves and clamped C2 transverse curves pass through direct
front, oblique and side landmarks. The accepted lower-body fitter is retained
unchanged; the new upper surface replaces the original Skin branch entirely.
"""
from __future__ import annotations

import math
from bisect import bisect_right
from dataclasses import dataclass


class CubicCurve:
    """Natural C2 cubic interpolation through scalar contour landmarks."""

    def __init__(self, xs, ys, slopes=None):
        if len(xs) != len(ys) or len(xs) < 3 or any(b <= a for a, b in zip(xs, xs[1:])):
            raise ValueError("Contour landmarks must have increasing heights")
        self.xs, self.ys = tuple(xs), tuple(ys)
        n = len(xs)
        h = [xs[i + 1] - xs[i] for i in range(n - 1)]
        diag, rhs, upper = [1.0] * n, [0.0] * n, [0.0] * n
        lower = [0.0] * n
        if slopes is not None:
            diag[0], upper[0] = 2 * h[0], h[0]
            rhs[0] = 6 * ((ys[1] - ys[0]) / h[0] - slopes[0])
            lower[-1], diag[-1] = h[-1], 2 * h[-1]
            rhs[-1] = 6 * (slopes[1] - (ys[-1] - ys[-2]) / h[-1])
        for i in range(1, n - 1):
            lower[i] = h[i - 1]
            diag[i] = 2 * (h[i - 1] + h[i])
            upper[i] = h[i]
            rhs[i] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1])
        for i in range(1, n):
            factor = lower[i] / diag[i - 1]
            diag[i] -= factor * upper[i - 1]
            rhs[i] -= factor * rhs[i - 1]
        second = [0.0] * n
        second[-1] = rhs[-1] / diag[-1]
        for i in range(n - 2, -1, -1):
            second[i] = (rhs[i] - upper[i] * second[i + 1]) / diag[i]
        self.second = tuple(second)

    def __call__(self, x):
        x = min(self.xs[-1], max(self.xs[0], x))
        i = max(0, min(len(self.xs) - 2, bisect_right(self.xs, x) - 1))
        h = self.xs[i + 1] - self.xs[i]
        a, b = (self.xs[i + 1] - x) / h, (x - self.xs[i]) / h
        return a * self.ys[i] + b * self.ys[i + 1] + ((a ** 3 - a) * self.second[i] + (b ** 3 - b) * self.second[i + 1]) * h * h / 6


def fade(a: float, b: float, x: float) -> float:
    """Quintic transition: value, slope, and curvature match at both ends."""
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u ** 3 * (10 + u * (-15 + 6 * u))


@dataclass(frozen=True)
class TorsoContours:
    # Retained coefficients freeze the already accepted waist/pelvis only.
    sections: tuple[tuple[float, float, float, float, float], ...]
    # z, half-width, center depth, 30-degree depth, 60-degree depth, back.
    # These direct surface landmarks replace the anterior spread formula.
    silhouette_rows: tuple[tuple[float, ...], ...] = ()
    lower_blend: tuple[float, float] = (0.565, 0.605)
    upper_blend: tuple[float, float] = (0.775, 0.818)
    center_y: float = 0.006

    def curves(self):
        z = [r[0] for r in self.sections]
        return tuple(CubicCurve(z, [r[k] for r in self.sections]) for k in range(1, 5))


def section_point(angle: float, section) -> tuple[float, float]:
    """Closed, smooth section. +angle is toward the character's left.

    A shared elliptical ribcage carries a broad anterior contour. The front
    extension vanishes with its first two derivatives at the sides. Front
    spread redistributes depth across the chest without introducing separate
    breast centers or displacing vertices vertically. The center stays shallow
    and continuous, while the oblique contour follows the same surface.
    """
    width, front, back, spread = section
    sn, cs = math.sin(angle), math.cos(angle)
    depth = back * cs
    if cs > 0:
        depth += ((front - back) + spread * sn * sn) * cs ** 3
    return width * sn, -depth


def silhouette_point(angle, section):
    """C2 transverse loft through explicit front/oblique/side landmarks.

    No radial chest volume is added. Zero end slopes join the left and right
    halves smoothly at the sternum and spine. Side and posterior anchors
    continue the same section into the ribcage.
    """
    width, center, inner, outer, back = section
    a = abs(math.atan2(math.sin(angle), math.cos(angle)))
    depth = CubicCurve(
        (0, math.pi / 6, math.pi / 3, math.pi / 2, 2 * math.pi / 3, 5 * math.pi / 6, math.pi),
        (center, inner, outer, 0, -0.5 * back, -math.sqrt(3) * back / 2, -back),
        slopes=(0, 0),
    )(a)
    return width * math.sin(angle), -depth


def fit_torso(obj, profile: TorsoContours, height: float) -> None:
    """Preserve stable regions, then construct the explicit upper loft.

    The retained fitter runs unchanged before the central upper region is
    replaced. It therefore cannot alter accepted lower-body coordinates.
    """
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    if profile.silhouette_rows:
        from dataclasses import replace
        from emilia_torso_surface import rebuild_upper_torso

        fit_torso(obj, replace(profile, silhouette_rows=()), height)
        rebuild_upper_torso(obj, profile, height)
        return

    verts = obj.data.vertices
    z0, z1 = profile.sections[0][0], profile.sections[-1][0]
    curves = profile.curves()
    tree = BVHTree.FromPolygons([v.co.copy() for v in verts], [list(f.vertices) for f in obj.data.polygons])
    zs = [r[0] for r in profile.sections]
    depths = []
    for z in zs:
        hit = tree.ray_cast(Vector((0, -height, z * height)), Vector((0, 1, 0)))[0]
        depths.append(profile.center_y - hit.y / height)
    base_front = CubicCurve(zs, depths)
    # The closed ribcage width, measured below the arm branch. Above that
    # branch, the side ray would measure an arm or the inside of an armpit.
    width_zs = (0.690, 0.715, 0.735, 0.750)
    widths = [tree.ray_cast(Vector((0, profile.center_y * height, z * height)), Vector((1, 0, 0)))[0].x / height for z in width_zs]
    base_width = CubicCurve(width_zs + (0.785, 0.818), tuple(widths) + (widths[-1], widths[-1]))
    for v in verts:
        p = v.co
        z, x, dy = p.z / height, p.x / height, profile.center_y - p.y / height
        if not z0 <= z <= z1:
            continue
        w = fade(*profile.lower_blend, z) * (1 - fade(*profile.upper_blend, z))
        w *= 1 - fade(0.10, 0.18, abs(x))
        if w <= 0:
            continue
        section = tuple(c(z) for c in curves)
        angle = math.atan2(x, dy)
        tx, ty = section_point(angle, section)
        switch = fade(0.745, 0.777, z)
        scale = section[0] / base_width(z)
        upper_x = x * scale
        u = min(1.0, abs(x) / base_width(z))
        cs3 = max(0.0, 1 - u * u) ** 1.5
        delta = max(0.0, section[1] - base_front(z)) * cs3 + section[3] * u * u * cs3
        upper_y = p.y / height - delta * fade(0.0, 0.015, dy)
        p.x += ((1 - switch) * tx + switch * upper_x - x) * height * w
        p.y += ((1 - switch) * (ty + profile.center_y) + switch * upper_y - p.y / height) * height * w
    obj.data.update()
    obj["torso_surface"] = "continuous_cubic_contours"

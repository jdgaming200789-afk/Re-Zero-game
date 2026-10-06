"""Continuous torso cross sections, independent of Blender mesh topology.

Each row is (height, half-width, center-front depth, back depth, front spread),
in fractions of character height. Natural cubic splines make the longitudinal
curvature continuous. One periodic transverse curve describes the entire
section; no ellipsoids, smooth-max unions, or separate chest volumes are used.
"""
from __future__ import annotations

import math
from bisect import bisect_right
from dataclasses import dataclass


class CubicCurve:
    """Natural C2 cubic interpolation through scalar contour landmarks."""

    def __init__(self, xs, ys):
        if len(xs) != len(ys) or len(xs) < 3 or any(b <= a for a, b in zip(xs, xs[1:])):
            raise ValueError("Contour landmarks must have increasing heights")
        self.xs, self.ys = tuple(xs), tuple(ys)
        n = len(xs)
        h = [xs[i + 1] - xs[i] for i in range(n - 1)]
        diag, rhs, upper = [1.0] * n, [0.0] * n, [0.0] * n
        for i in range(1, n - 1):
            lower = h[i - 1]
            diag[i] = 2 * (h[i - 1] + h[i])
            upper[i] = h[i]
            rhs[i] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1])
            factor = lower / diag[i - 1]
            diag[i] -= factor * upper[i - 1]
            rhs[i] -= factor * rhs[i - 1]
        second = [0.0] * n
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
    sections: tuple[tuple[float, float, float, float, float], ...]
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


def fit_torso(obj, profile: TorsoContours, height: float) -> None:
    """Reparameterize the existing connected body onto the contour surface.

    Original vertices, faces, and Z coordinates are preserved. Their polar
    angles supply surface coordinates. The target dimensions all come from
    the reference-guided profile. The pelvis and thighs lie outside the
    deformation, and C2 blending connects to the original waist/shoulder mesh.
    """
    verts = obj.data.vertices
    z0, z1 = profile.sections[0][0], profile.sections[-1][0]
    curves = profile.curves()
    for v in verts:
        p = v.co
        z, x, dy = p.z / height, p.x / height, profile.center_y - p.y / height
        if not z0 <= z <= z1:
            continue
        w = fade(*profile.lower_blend, z) * (1 - fade(*profile.upper_blend, z))
        # Leave A-pose arms and the outer shoulder web alone. This boundary
        # also has zero first/second derivatives and lies above the chest.
        w *= 1 - fade(0.10, 0.145, abs(x))
        if w <= 0:
            continue
        # Direct polar coordinates remain stable across the shoulder web.
        # A radius sampled toward the A-posed arm would normalize unrelated
        # torso vertices by the arm span and fold this transition inward.
        angle = math.atan2(x, dy)
        tx, ty = section_point(angle, tuple(c(z) for c in curves))
        p.x += (tx * height - p.x) * w
        p.y += ((ty + profile.center_y) * height - p.y) * w
    obj.data.update()
    obj["torso_surface"] = "continuous_cubic_contours"

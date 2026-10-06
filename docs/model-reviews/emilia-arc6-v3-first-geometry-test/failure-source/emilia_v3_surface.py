"""First, isolated test of the frozen V3 hypothesis on existing torso vertices.

One C2 section loft replaces the anterior transverse interpolation. No new
objects, ellipsoid fields, vertices, or faces are introduced. Guide coordinates
are registered once to the existing lower ribcage and upper test boundary.
The registration is an experimental choice, not a measurement of hidden anatomy.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
from scipy.interpolate import CubicSpline

from torso_contours import CubicCurve, fade

GUIDE_DIGEST = "4b91950ad23ee844e52b476874b8c6de981fca502d2b4d502f73226572827d67"
LOWER, UPPER = 0.675, 0.812
Y_LOWER, Y_UPPER = 311.0, 55.0
AZIMUTH = math.radians(40)


def guide_at(path, y):
    """Evaluate the original monotone-y cubic path, without changing it."""
    start = np.array(path[0][1:], dtype=float)
    y = min(float(path[-1][-1]), max(float(start[1]), y))
    for command in path[1:]:
        if command[0] != "C":
            raise ValueError("Only frozen cubic guide commands are expected")
        control = np.array([start, command[1:3], command[3:5], command[5:7]])
        if y <= control[-1, 1]:
            lo, hi = 0.0, 1.0
            for _ in range(42):
                t = (lo + hi) / 2
                p = bezier(control, t)
                if p[1] < y:
                    lo = t
                else:
                    hi = t
            return float(bezier(control, (lo + hi) / 2)[0])
        start = control[-1]
    raise RuntimeError("Guide evaluation failed")


def bezier(control, t):
    n = len(control) - 1
    return sum(math.comb(n, i) * (1 - t) ** (n - i) * t ** i * control[i]
               for i in range(n + 1))


def section_control(width, depth, shape):
    """Convex quintic quadrant with horizontal medial / vertical side tangents.

    The oblique support adjusts transverse curvature while front width and
    side depth stay fixed. All sections remain single, monotone quadrant arcs.
    The templates are planar control polygons, never volumetric primitives.
    """
    compact = np.array(((0, 1), (.10, 1), (.28, .86), (.64, .54), (1, .12), (1, 0)))
    broad = np.array(((0, 1), (.38, 1), (.68, .98), (.90, .78), (1, .40), (1, 0)))
    return (compact + shape * (broad - compact)) * np.array((width, depth))


def oblique_support(width, depth, shape):
    p = section_control(width, depth, shape)
    normal = np.array((math.cos(AZIMUTH), math.sin(AZIMUTH)))
    # The support of a strictly convex quadrant has one interior maximum.
    lo, hi = 0.0, 1.0
    for _ in range(38):
        a, b = (2 * lo + hi) / 3, (lo + 2 * hi) / 3
        if bezier(p, a).dot(normal) < bezier(p, b).dot(normal):
            lo = a
        else:
            hi = b
    return float(bezier(p, (lo + hi) / 2).dot(normal))


def fit_support(width, depth, wanted):
    low, high = oblique_support(width, depth, 0), oblique_support(width, depth, 1)
    if wanted <= low:
        return 0.0, low - wanted
    if wanted >= high:
        return 1.0, high - wanted
    lo, hi = 0.0, 1.0
    for _ in range(26):
        mid = (lo + hi) / 2
        if oblique_support(width, depth, mid) < wanted:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2, 0.0


class FrozenV3Surface:
    def __init__(self, frozen_path: Path, profile):
        self.frozen_path = frozen_path
        payload = json.loads(frozen_path.read_text())
        if payload["guide_payload_sha256"] != GUIDE_DIGEST:
            raise RuntimeError("Frozen guide digest differs")
        self.guides = payload["guide_paths"]
        # Baseline section data locates the locked boundaries only. Its old
        # chest surface is not used as a visual/anatomical target.
        rows = profile.silhouette_rows
        self.old = [CubicCurve([r[0] for r in rows], [r[k] for r in rows]) for k in range(1, 6)]
        self.unit = self.old[0](LOWER) / 70.0
        self.center_y = profile.center_y
        self.levels = np.linspace(LOWER, UPPER, 81)
        records = []
        for z in self.levels:
            y = self.guide_y(z)
            front, oblique, side = [g["paths"] for g in self.guides]
            width = (guide_at(front[1], y) - guide_at(front[0], y)) * self.unit / 2
            upper_x, lower_x = side[0][0][1], side[0][-1][-2]
            u = min(1.0, max(0.0, (y - side[0][0][-1]) / (side[0][-1][-1] - side[0][0][-1])))
            baseline_x = (1 - u) * upper_x + u * lower_x
            anchor_depth = (1 - u) * self.old[1](UPPER) + u * self.old[1](LOWER)
            depth = anchor_depth + (guide_at(side[0], y) - baseline_x) * self.unit
            back = self.old[4](z)  # midline posterior depth is fixed
            near = (guide_at(oblique[1], y) - 219.0) * self.unit
            far = (219.0 - guide_at(oblique[0], y)) * self.unit
            front_shape, near_error = fit_support(width, depth, near)
            back_shape, far_error = fit_support(width, back, far)
            records.append([float(z), width, depth, back, front_shape, back_shape,
                            near, far, near_error, far_error])
        self.records = records
        self.curves = [CubicCurve(self.levels, [r[i] for r in records]) for i in range(1, 6)]
        self.sections = {}

    @staticmethod
    def guide_y(z):
        return Y_UPPER + (UPPER - z) / (UPPER - LOWER) * (Y_LOWER - Y_UPPER)

    def point(self, theta, z):
        key = round(float(z), 11)
        if key not in self.sections:
            width, front, back, kf, kb = [curve(z) for curve in self.curves]
            angles = np.linspace(0, 2 * math.pi, 49)
            points = []
            for angle in angles:
                a = abs(math.atan2(math.sin(angle), math.cos(angle)))
                anterior = a <= math.pi / 2
                t = a / (math.pi / 2) if anterior else (math.pi - a) / (math.pi / 2)
                p = bezier(section_control(width, front if anterior else back,
                                           min(1.0, max(0.0, kf if anterior else kb))), t)
                points.append((math.copysign(float(p[0]), math.sin(angle)),
                               self.center_y + (-1 if anterior else 1) * float(p[1])))
            points[-1] = points[0]
            # A closed periodic C2 interpolant joins all four quadrants. The
            # cardinal width/depth anchors stay exact; no curvature seam is
            # left where anterior and posterior quadrants meet.
            self.sections[key] = CubicSpline(angles, points, bc_type="periodic", axis=0)
        return tuple(float(v) for v in self.sections[key](theta % (2 * math.pi)))

    def weight(self, theta, parameter_z, actual_z):
        if not LOWER < actual_z < UPPER:
            return 0.0
        height_weight = fade(LOWER, .701, actual_z) * (1 - fade(.792, UPPER, actual_z))
        distance = min(abs(math.atan2(math.sin(theta - c), math.cos(theta - c)))
                       for c in (math.pi / 2, 3 * math.pi / 2))
        radius = math.sqrt((distance / .56) ** 2 + ((parameter_z - .773) / .037) ** 2)
        # Exact arm-window boundary and every bridge vertex stay fixed.
        # Two zero derivatives at the guard prevent a new shoulder seam.
        return height_weight * fade(1.05, 1.65, radius)

    def apply(self, body, parameters, height):
        before = np.array([v.co[:] for v in body.data.vertices], dtype=np.float64)
        weights = np.zeros(len(before))
        for index, theta, parameter_z in parameters:
            z = before[index, 2] / height
            weight = self.weight(theta, parameter_z, z)
            weights[index] = weight
            if weight == 0:
                continue
            x, y = self.point(theta, z)
            body.data.vertices[index].co.x = before[index, 0] + weight * (x * height - before[index, 0])
            body.data.vertices[index].co.y = before[index, 1] + weight * (y * height - before[index, 1])
        body.data.update()
        after = np.array([v.co[:] for v in body.data.vertices], dtype=np.float64)
        locked = weights == 0
        assert np.array_equal(before[locked], after[locked]), "A locked vertex moved"
        assert np.array_equal(before[:, 2], after[:, 2]), "A vertical coordinate changed"
        body["torso_surface"] = "isolated_frozen_v3_quintic_section_test"
        return before, after, weights, {
            "method": "one C2 height loft of closed periodic C2 sections interpolating convex quintic quadrants; existing vertex topology",
            "guide_payload_sha256": GUIDE_DIGEST,
            "frozen_file_sha256": hashlib.sha256(self.frozen_path.read_bytes()).hexdigest(),
            "registration": {"guide_y_55_z_over_H": UPPER, "guide_y_311_z_over_H": LOWER,
                             "common_horizontal_unit_over_H": self.unit,
                             "front_center_x": 216, "oblique_center_x": 219,
                             "side_origin": "straight line between frozen SIDE endpoints; existing ribcage anchor depths",
                             "note": "dimensionless experimental registration; no official measurements or garment depth"},
            "patch": {"z_over_H": [LOWER, UPPER], "lower_fade": [LOWER, .701],
                      "upper_fade": [.792, UPPER], "arm_guard_radius": [1.05, 1.65]},
            "vertex_count": len(before), "changed_vertices": int(np.count_nonzero(np.any(before != after, axis=1))),
            "locked_vertices": int(locked.sum()), "locked_vertices_changed": 0,
            "vertical_coordinates_changed": 0, "vertices_added": 0, "faces_added": 0,
            "maximum_displacement_over_H": float(np.max(np.linalg.norm(after - before, axis=1)) / height),
            "section_fit_columns": ["z/H", "width/H", "front/H", "back/H", "front_shape", "back_shape", "near_support/H", "far_support/H", "near_residual/H", "far_residual/H"],
            "section_fit": self.records,
        }

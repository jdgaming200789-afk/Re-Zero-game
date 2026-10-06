"""Independent projected contours for Emilia's continuous anterior torso.

The front curve specifies half-width, the true-side curve specifies actual
maximum anterior depth, and the 40-degree curve specifies projected extent.
These are support contours of one surface, not radii of added chest volumes.
The medial contour has its own height trend so the lower transition does not
form a horizontal band across the chest.
"""
from __future__ import annotations

import math

from torso_contours import CubicCurve, fade


def bezier5(u, controls):
    """Quintic Bezier evaluation, bounded by its control polygon."""
    q = list(controls)
    for n in range(5, 0, -1):
        for i in range(n):
            q[i] = (1 - u) * q[i] + u * q[i + 1]
    return q[0]


def hermite5(a, b, y0, y1, m0, m1, k0, k1):
    """Bezier controls from endpoint value, tangent and curvature."""
    h = b - a
    return (y0, y0 + m0 * h / 5,
            y0 + 2 * m0 * h / 5 + k0 * h * h / 20,
            y1 - 2 * m1 * h / 5 + k1 * h * h / 20,
            y1 - m1 * h / 5, y1)


class AnteriorContours:
    """C2 transverse sections constrained in three projection directions."""

    outer_angle = math.radians(60)
    view_angle = math.radians(40)

    def __init__(self, rows):
        # z, front half-width, medial depth, true-side depth, oblique extent.
        self.rows = rows
        self.curves = tuple(CubicCurve([r[0] for r in rows], [r[k] for r in rows])
                            for k in range(1, 5))
        self.cache = {}

    def _segments(self, center, maximum, outer, back):
        # A fixed crest angle creates a flat strip below the chest when the
        # medial and side contours converge. Let the crest migrate toward
        # the sternum in those rows, then spread out over the fullest region.
        # Its angle is reconciled with the 40-degree extent, not an ellipsoid.
        a = 1.25 * math.sqrt(maximum - center) / math.sqrt(maximum)
        b, c = self.outer_angle, math.pi / 2
        # A shallow medial saddle and the actual side maximum share a
        # continuous curvature. Monotone control polygons prevent overshoot.
        curvature = 6 * (maximum - center) / (a * a)
        outer_slope = -min(1.7 * outer, 1.8 * (maximum - outer) / (b - a))
        return (
            (0, a, hermite5(0, a, center, maximum, 0, 0,
                            curvature, -curvature)),
            (a, b, hermite5(a, b, maximum, outer, 0, outer_slope,
                            -curvature, 0)),
            (b, c, hermite5(b, c, outer, 0, outer_slope, -back, 0, 0)),
        )

    @staticmethod
    def depth(angle, segments):
        for a, b, controls in segments:
            if angle <= b:
                return bezier5((angle - a) / (b - a), controls)
        return 0.0

    def section(self, z, back):
        key = (z, back)
        if key in self.cache:
            return self.cache[key]
        width, center, maximum, oblique = (c(z) for c in self.curves)
        if maximum < center:
            raise ValueError(f"Side contour lies behind medial contour at {z}")
        # Solve the transverse outer landmark from an independent projected
        # contour. The side maximum remains fixed throughout this solve.
        cs, sn = math.cos(self.view_angle), math.sin(self.view_angle)

        def support(outer):
            segments = self._segments(center, maximum, outer, back)
            # Golden-section search on a dense bracket avoids mesh-resolution
            # dependence in the oblique maximum.
            def value(a):
                return width * math.sin(a) * cs + self.depth(a, segments) * sn
            angles = [i * math.pi / 2 / 64 for i in range(65)]
            k = max(range(65), key=lambda i: value(angles[i]))
            lo, hi = angles[max(0, k - 1)], angles[min(64, k + 1)]
            ratio = (math.sqrt(5) - 1) / 2
            p, q = hi - ratio * (hi - lo), lo + ratio * (hi - lo)
            for _ in range(28):
                if value(p) > value(q):
                    hi, q = q, p
                    p = hi - ratio * (hi - lo)
                else:
                    lo, p = p, q
                    q = lo + ratio * (hi - lo)
            return max(value(lo), value(hi))

        lo, hi = 0.08 * maximum, 0.78 * maximum
        minimum, limit = support(lo), support(hi)
        if not minimum <= oblique <= limit:
            raise ValueError(f"Incompatible front/side/oblique contours at {z:.5f}: "
                             f"{oblique:.5f} outside {minimum:.5f}..{limit:.5f}")
        for _ in range(30):
            mid = (lo + hi) / 2
            if support(mid) < oblique:
                lo = mid
            else:
                hi = mid
        segments = self._segments(center, maximum, (lo + hi) / 2, back)
        # Reject an unbounded segment instead of silently clipping its shape.
        for a, b, controls in segments:
            if min(controls) < -1e-9 or max(controls) > maximum + 1e-9:
                raise ValueError(f"Unbounded transverse contour at {z:.5f}")
        result = width, segments
        self.cache[key] = result
        return result

    def refit(self, bm, parameters, frame_curves, height, center_y):
        """Replace only the central loft, retaining all arm graft coordinates.

        The preceding loft supplies the unchanged shoulder boundary and its
        fairing. A C2 mask joins the contour patch to that boundary. Retained
        arms, head, neck and all points at/below .670H are never written.
        """
        import numpy as np
        from scipy import sparse
        from scipy.sparse.linalg import spsolve

        desired, fidelity = {}, {}
        for vertex, (theta, z) in parameters.items():
            if not vertex.is_valid:
                continue
            angle = abs(math.atan2(math.sin(theta), math.cos(theta)))
            if not 0.670 < z < 0.804:
                continue
            d = math.pi / 2 - angle
            radius = math.sqrt((d / 0.56) ** 2 + ((z - 0.773) / 0.037) ** 2)
            if radius <= 1.12:
                continue
            width = self.curves[0](z)
            x = math.copysign(width * math.sin(angle), math.sin(theta))
            y = vertex.co.y
            if angle <= math.pi / 2:
                back = frame_curves[4](z)
                width, segments = self.section(z, back)
                y = (center_y - self.depth(angle, segments)) * height
            # The same width curve continues around the back; only the
            # anterior wall receives the new depth field. No height moves.
            desired[vertex] = (x * height - vertex.co.x, y - vertex.co.y)
            # The target contours govern the interior. At the retained
            # boundary, a minimum-curvature solve supplies a smooth join
            # instead of multiplying the shape by a short radial mask.
            fidelity[vertex] = (fade(0.670, 0.694, z)
                                * (1 - fade(0.775, 0.804, z))
                                * fade(1.12, 1.6, radius))

        vertices = list(desired)
        index = {v: i for i, v in enumerate(vertices)}
        vicinity = set(vertices)
        for vertex in vertices:
            vicinity.update(e.other_vert(vertex) for e in vertex.link_edges)
        rows, columns, values, old_laplacian = [], [], [], []
        for row, vertex in enumerate(vicinity):
            neighbors = [e.other_vert(vertex) for e in vertex.link_edges]
            # Geometric distances account for the different angular and
            # height sampling intervals without moving the preserved mesh.
            weights = [1 / max((v.co - vertex.co).length_squared,
                               (0.0004 * height) ** 2) for v in neighbors]
            total = sum(weights)
            old_laplacian.append([
                vertex.co[k] - sum(v.co[k] * w for v, w in zip(neighbors, weights)) / total
                for k in (0, 1)
            ])
            if vertex in index:
                rows.append(row); columns.append(index[vertex]); values.append(1)
            for v, w in zip(neighbors, weights):
                if v in index:
                    rows.append(row); columns.append(index[v]); values.append(-w / total)
        laplace = sparse.coo_matrix((values, (rows, columns)),
                                   shape=(len(vicinity), len(vertices))).tocsr()
        # Minimize curvature of the resulting surface itself. Penalizing
        # only displacement would retain curvature from the discarded chest
        # fit near the graft, including its band. Fixed outside rows sew the
        # new surface to the preserved shoulder. Topology stays unchanged.
        weight = np.array([0.002 * fidelity[v] for v in vertices])
        system = laplace.T @ laplace + sparse.diags(weight)
        rhs = (weight[:, None] * np.array([desired[v] for v in vertices])
               - laplace.T @ np.array(old_laplacian))
        displacement = spsolve(system.tocsc(), rhs)
        if not np.isfinite(displacement).all():
            raise RuntimeError("Nonfinite anterior-contour fairing")
        for vertex, delta in zip(vertices, displacement):
            vertex.co.x += float(delta[0])
            vertex.co.y += float(delta[1])
        return len(vertices)

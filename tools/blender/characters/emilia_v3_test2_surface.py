"""One globally fitted anterior surface for the second isolated V3 test.

The original mesh supplies only locked boundary positions and topology.
The V3 drawing supplies no pixel-derived depth, width or polygonal target.
A complete C2 side hypothesis and minimum curvature variation determine a
single surface, with convex transverse turns. No old template or volume fields.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.interpolate import BSpline, CubicSpline
from scipy.linalg import null_space

MATH_CACHE = Path(__file__).resolve().parents[1] / ".cache/test2-math"
if MATH_CACHE.exists():
    sys.path.insert(0, str(MATH_CACHE))
import osqp

LOWER, UPPER, CENTER_Y = .675, .812, .006


def mesh_operators(co, triangles):
    """Cotangent surface metric and area for a final-position bending energy."""
    n = len(co)
    a, b, c = (co[triangles[:, i]] for i in range(3))
    twice_area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    assert np.min(twice_area) > 1e-13
    mass = np.zeros(n)
    for i in range(3):
        np.add.at(mass, triangles[:, i], twice_area / 6)
    row, col, weight = [], [], []
    for i, j, k in ((0, 1, 2), (1, 2, 0), (2, 0, 1)):
        u, v = co[triangles[:, j]] - co[triangles[:, i]], co[triangles[:, k]] - co[triangles[:, i]]
        w = .5 * np.einsum("ij,ij->i", u, v) / twice_area
        row.extend((triangles[:, j], triangles[:, k]))
        col.extend((triangles[:, k], triangles[:, j]))
        weight.extend((w, w))
    W = sparse.coo_matrix((np.concatenate(weight), (np.concatenate(row), np.concatenate(col))), shape=(n, n)).tocsr()
    L = sparse.diags(np.asarray(W.sum(axis=1)).ravel()) - W
    # Adjacency uses all triangle edges, including zero-cotangent diagonals.
    er = np.concatenate((triangles[:, 0], triangles[:, 1], triangles[:, 2]))
    ec = np.concatenate((triangles[:, 1], triangles[:, 2], triangles[:, 0]))
    adj = sparse.coo_matrix((np.ones(2 * len(er)), (np.r_[er, ec], np.r_[ec, er])), shape=(n, n)).tocsr()
    return L, mass, adj


def side_curve(co, provenance, free, projection):
    """One smooth spline with distributed curvature change along its ENTIRE arc.

    No two-span crest construction. A fifth-degree B-spline has enough
    freedom to meet locked boundary derivatives without forcing a wedge.
    Monotonicity is checked throughout both intervals. Existing boundary
    derivatives are compatibility constraints, not anatomy.
    """
    ids, theta = provenance[:, 0].astype(int), provenance[:, 1]
    medial = ids[np.abs(np.arctan2(np.sin(theta), np.cos(theta))) < 1e-7]
    medial = medial[np.argsort(co[medial, 2])]
    zs, ds = co[medial, 2], CENTER_Y - co[medial, 1]
    f = CubicSpline(zs, ds)
    free_medial = medial[free[medial]]
    assert len(free_medial) > 20
    low_index = np.searchsorted(zs, co[free_medial, 2].min()) - 1
    high_index = np.searchsorted(zs, co[free_medial, 2].max()) + 1
    low, high = float(zs[low_index]), float(zs[high_index])
    # A longer return than onset is part of the conceptual hypothesis.
    crest = .7512633333333334
    endpoints = [[float(f(low)), float(f(low, 1)), float(f(low, 2))],
                 [float(f(high)), float(f(high, 1)), float(f(high, 2))]]
    degree = 5
    inner = np.sort(np.unique(np.r_[np.linspace(low, high, 33)[1:-1], crest]))
    knots = np.r_[np.repeat(low, degree + 1), inner, np.repeat(high, degree + 1)]
    size = len(knots) - degree - 1
    basis = BSpline(knots, np.eye(size), degree)
    sample = np.r_[np.linspace(low, crest, 601), np.linspace(crest, high, 601)]
    step = (high - low) / (len(sample) - 1)
    d3 = basis.derivative(3)(sample)
    # Minimum variation of d2 across the whole curve, rather than matching
    # just onset / crest / return coordinates. No primitive target shape.
    Q = d3.T @ d3 * step
    Q /= np.median(np.diag(Q))
    rows, targets = [], []
    for z, derivatives in ((low, endpoints[0]), (crest, [projection, 0.0]), (high, endpoints[1])):
        for order, target in enumerate(derivatives):
            row = basis.derivative(order)(z) if order else basis(z)
            factor = np.max(np.abs(row))
            rows.append(row / factor); targets.append(target / factor)
    sign = np.where(sample <= crest, 1.0, -1.0)
    derivative_rows = sign[:, None] * basis.derivative()(sample)
    factors = np.max(np.abs(derivative_rows), axis=1)
    E, target = np.array(rows), np.array(targets)
    particular = np.linalg.lstsq(E, target, rcond=None)[0]
    Z = null_space(E)
    ev, vectors = np.linalg.eigh(Z.T @ Q @ Z)
    assert ev.min() > 0
    # Eliminate exact boundary/crest equalities, then whiten the bending
    # metric. This conditions the numerical solve without changing targets.
    T = Z @ (vectors / np.sqrt(ev)[None, :])
    G = derivative_rows / factors[:, None]
    A = G @ T
    scale = np.max(np.abs(A), axis=1)
    valid = scale > 1e-12
    A = A[valid] / scale[valid, None]
    lows = -(G @ particular)[valid] / scale[valid]
    solver = osqp.OSQP()
    solver.setup(P=sparse.eye(T.shape[1], format="csc"), q=T.T @ Q @ particular, A=sparse.csc_matrix(A),
                 l=lows, u=np.full(len(lows), np.inf), eps_abs=1e-9, eps_rel=1e-9, max_iter=50000,
                 polishing=True, verbose=False, time_limit=15)
    result = solver.solve()
    if result.info.status not in ("solved", "solved inaccurate"):
        raise RuntimeError(f"Complete side spline did not solve: {result.info.status}; residuals {result.info.prim_res}, {result.info.dual_res}")
    coefficients = particular + T @ result.x
    assert np.max(np.abs(E @ coefficients - target)) < 1e-9
    q = BSpline(knots, coefficients, degree)
    d = q.derivative()(sample)
    assert np.min(sign * d) > -1e-6
    return q, {"lower_z_over_H": low, "crest_z_over_H": crest, "upper_z_over_H": high,
               "projection_over_H": projection, "projection_role": "unapproved Test 1 magnitude held as an experimental control, not reference evidence",
               "endpoint_value_slope_curvature": endpoints, "crest_curvature_times_H": float(q.derivative(2)(crest)),
               "objective": "integrated squared change of second derivative along the complete side arc",
               "representation": "one fifth-degree B-spline, no two-span crest or literal magenta fit",
               "spline_coefficients": size, "solver_status": result.info.status,
               "monotone_derivative_check_samples": len(sample), "minimum_monotone_derivative": float(np.min(sign * d))}


def solve_surface(before_m, triangles, provenance, height, projection):
    co = before_m / height
    n = len(co)
    ids = provenance[:, 0].astype(int)
    theta = np.arctan2(np.sin(provenance[:, 1]), np.cos(provenance[:, 1]))
    grid = np.zeros(n, dtype=bool)
    grid[ids] = True
    front = np.zeros(n, dtype=bool)
    front[ids] = np.abs(theta) < math.pi / 2 - 1e-7
    domain = grid & front & (co[:, 2] > LOWER) & (co[:, 2] < UPPER)
    L, mass, adjacency = mesh_operators(co, triangles)
    # Two exact boundary rows form a fixed collar. Values and local slope
    # stay with the preserved body rather than using a displacement fade.
    boundary = domain & (np.asarray(adjacency @ (~domain).astype(float)).ravel() > 0)
    collar = boundary | (domain & (np.asarray(adjacency @ boundary.astype(float)).ravel() > 0))
    free = domain & ~collar
    qside, curve_report = side_curve(co, provenance, free, projection)
    medial = np.zeros(n, dtype=bool)
    medial[ids[np.abs(theta) < 1e-7]] = True
    anchors = medial & free
    unknown = free & ~anchors
    uids, fixed = np.flatnonzero(unknown), np.flatnonzero(~unknown)
    y = co[:, 1].copy()
    y[anchors] = CENTER_Y - qside(co[anchors, 2])
    H = (L.T @ sparse.diags(1 / np.maximum(mass, 1e-14)) @ L).tocsr()
    scale = float(np.median(H.diagonal()[uids]))
    Q = H[uids][:, uids] / scale
    linear = np.asarray(H[uids][:, fixed] @ y[fixed]).ravel() / scale
    lookup = np.full(n, -1, dtype=int)
    lookup[uids] = np.arange(len(uids))
    rr, cc, vv, lower, upper = [], [], [], [], []
    def constraint(vertices, coefficients, lo=0.0, hi=np.inf):
        constant = 0.0
        row = len(lower)
        divisor = max(abs(float(v)) for v in coefficients)
        for i, coefficient in zip(vertices, coefficients):
            coefficient /= divisor
            if lookup[i] >= 0:
                rr.append(row); cc.append(lookup[i]); vv.append(coefficient)
            else:
                constant += coefficient * y[i]
        lower.append(lo / divisor - constant)
        upper.append(hi / divisor - constant)
    # Entire transverse rows obey monotone, convex turning. An off-center
    # depth peak cannot form a lower pocket inside the solved region.
    row_keys = np.round(provenance[:, 2], 9)
    transverse_constraints = 0
    for zkey in np.unique(row_keys):
        mask = (row_keys == zkey) & (np.abs(theta) < math.pi / 2 - 1e-7)
        vi = ids[mask]
        for sign in (-1, 1):
            side = vi[sign * co[vi, 0] >= -1e-8]
            side = side[np.argsort(np.abs(co[side, 0]))]
            for a, b in zip(side, side[1:]):
                if free[a] and free[b]:
                    constraint([a, b], [-1, 1]); transverse_constraints += 1
            for a, b, c in zip(side, side[1:], side[2:]):
                if free[a] and free[b] and free[c]:
                    dx1, dx2 = abs(co[b, 0]) - abs(co[a, 0]), abs(co[c, 0]) - abs(co[b, 0])
                    if min(dx1, dx2) > 1e-7:
                        constraint([a, b, c], [1 / dx1, -1 / dx1 - 1 / dx2, 1 / dx2]); transverse_constraints += 1
    # Projection stays bounded by the complete central curve at EVERY free
    # vertex. The magnitude is a controlled test variable, not an art claim.
    for i in uids:
        constraint([i], [1], lo=float(CENTER_Y - qside(co[i, 2])), hi=CENTER_Y)
    A = sparse.coo_matrix((vv, (rr, cc)), shape=(len(lower), len(uids))).tocsc()
    solver = osqp.OSQP()
    solver.setup(P=sparse.triu(Q).tocsc(), q=linear, A=A,
                 l=np.array(lower), u=np.array(upper), eps_abs=2e-8, eps_rel=2e-8,
                 max_iter=30000, polishing=True, verbose=False, time_limit=60)
    result = solver.solve()
    if result.info.status not in ("solved", "solved inaccurate"):
        raise RuntimeError(f"Surface constraints did not solve: {result.info.status}")
    y[uids] = result.x
    after = before_m.copy()
    after[free, 1] = y[free] * height
    # Respect the actual GLB float precision before locks / measurements.
    after = after.astype(np.float32).astype(np.float64)
    assert np.array_equal(after[~free], before_m[~free])
    assert np.array_equal(after[:, [0, 2]], before_m[:, [0, 2]])
    report = {"method": "globally constrained final-surface biharmonic fit with convex transverse rows and complete C2 side arc",
              "source_mesh_rebuilt": False, "template_bounds_used": False, "literal_guide_coordinates_used": False,
              "old_displacement_blend_used": False, "side_curve": curve_report,
              "solver": {"name": "OSQP", "version": osqp.__version__, "status": result.info.status,
                         "iterations": result.info.iter, "solve_seconds": result.info.run_time,
                         "primal_residual": result.info.prim_res, "dual_residual": result.info.dual_res,
                         "unknown_vertices": len(uids), "constraints": len(lower), "transverse_constraints": transverse_constraints},
              "patch_z_over_H": [LOWER, UPPER], "boundary_collar_vertices": int(collar.sum()),
              "fixed_vertices": int((~free).sum()), "changed_vertices": int(np.any(after != before_m, axis=1).sum()),
              "locked_vertex_changes": 0, "x_coordinate_changes": 0, "z_coordinate_changes": 0,
              "vertex_count_change": 0, "topology_change": 0,
              "maximum_displacement_over_H": float(np.linalg.norm(after - before_m, axis=1).max() / height),
              "symmetry_note": "One connected surface solve; no separate left/right anterior objects"}
    return after, free, report, qside

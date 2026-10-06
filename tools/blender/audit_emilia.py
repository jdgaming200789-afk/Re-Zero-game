"""Audit the uncut procedural body and optionally its chest garment.

Run against the working tree or an exact baseline checkout with --code-dir.
Auditing the complete body prevents hidden-face deletion from concealing a
bad fit. Results and raw vertex coordinates are saved with each checkpoint.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def topology(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    result = {
        "vertices": len(bm.verts), "faces": len(bm.faces),
        "boundary_edges": sum(e.is_boundary for e in bm.edges),
        "nonmanifold_edges": sum(not e.is_manifold for e in bm.edges),
        "degenerate_faces": sum(f.calc_area() < 1e-12 for f in bm.faces),
        "nonfinite_vertices": sum(not all(math.isfinite(c) for c in v.co) for v in bm.verts),
    }
    bm.free()
    return result


def surface_crossings(obj):
    """Check transverse intersections between nonadjacent actual triangles.

    Closed/manifold edges alone do not detect a folded Skin branch. Coplanar
    contacts and triangles sharing vertices are excluded from this check.
    """
    obj.data.calc_loop_triangles()
    coords = [v.co.copy() for v in obj.data.vertices]
    triangles = [tuple(t.vertices) for t in obj.data.loop_triangles]
    tree = BVHTree.FromPolygons(coords, triangles, all_triangles=True)

    def crosses(start, end, tri):
        a, b, c = (coords[i] for i in tri)
        direction, e1, e2 = end - start, b - a, c - a
        h = direction.cross(e2)
        det = e1.dot(h)
        if abs(det) < 1e-13:
            return False
        q = start - a
        u = q.dot(h) / det
        if not 1e-7 < u < 1 - 1e-7:
            return False
        r = q.cross(e1)
        v = direction.dot(r) / det
        if v <= 1e-7 or u + v >= 1 - 1e-7:
            return False
        return 1e-7 < e2.dot(r) / det < 1 - 1e-7

    pairs, candidates = [], 0
    for a, b in tree.overlap(tree):
        if a >= b or set(triangles[a]) & set(triangles[b]):
            continue
        candidates += 1
        hit = any(crosses(coords[first[k]], coords[first[(k + 1) % 3]], second)
                  for first, second in ((triangles[a], triangles[b]), (triangles[b], triangles[a]))
                  for k in range(3))
        if hit:
            pairs.append((a, b))
    return {"scope": "complete body, transverse nonadjacent triangles; coplanar/shared-vertex contacts excluded",
            "candidates_checked": candidates, "crossing_pairs": len(pairs), "examples": pairs[:20]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--code-dir", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--out", required=True)
    parser.add_argument("--cloth", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(Path(args.code_dir).resolve() / "tools/blender/characters"))
    from build import reset
    from humanoid import Joints, build_body
    from emilia_arc6 import emilia_arc6, _triangulate_chest, chest_cover

    reset()
    spec = emilia_arc6()
    j = Joints(spec.body)
    body = build_body("emilia_audit_body", spec.body, j)
    j.body = body
    vertices = np.array([v.co[:] for v in body.data.vertices], dtype=np.float64)
    report = {"source_code": str(Path(args.code_dir).resolve()), "body": topology(body)}
    _triangulate_chest(j)
    report["surface_crossings"] = surface_crossings(body)
    body.data.calc_loop_triangles()
    tree = BVHTree.FromPolygons([v.co.copy() for v in body.data.vertices], [list(t.vertices) for t in body.data.loop_triangles], all_triangles=True)
    report["sections"] = []
    for z in (0.55, 0.59, 0.61, 0.63, 0.65, 0.67, 0.69, 0.71, 0.73, 0.75, 0.77):
        centre = Vector((0, 0.006 * j.H, z * j.H))
        row = {"height_H": z, "rays": {}}
        for az in (0, 35, 65, 90, 180):
            a = math.radians(az)
            hit = tree.ray_cast(centre, Vector((math.sin(a), -math.cos(a), 0)))[0]
            row["rays"][str(az)] = [round(c / j.H, 6) for c in hit] if hit is not None else None
        report["sections"].append(row)
    if args.cloth:
        mat = bpy.data.materials.new("audit cloth")
        cloth = chest_cover("emilia_audit_cloth", j, mat)
        report["cloth"] = topology(cloth)
        cloth.data.calc_loop_triangles()
        coords = [v.co.copy() for v in cloth.data.vertices]
        # Vertices, edge midpoints and triangle centers catch a panel which
        # is outside at its corners but intersects the body between them.
        samples = coords[:]
        samples.extend((coords[e.vertices[0]] + coords[e.vertices[1]]) * 0.5 for e in cloth.data.edges)
        samples.extend(sum((coords[i] for i in tri.vertices), Vector()) / 3 for tri in cloth.data.loop_triangles)
        gaps = []
        worst = []
        for p in samples:
            q, normal, _, _ = tree.find_nearest(p)
            if q is not None:
                gap = (p - q).dot(normal)
                gaps.append(gap)
                if gap < -1e-5:
                    worst.append({"gap_m": gap, "point_H": [c / j.H for c in p], "nearest_H": [c / j.H for c in q], "normal": list(normal)})
        report["cloth_fit"] = {"samples": len(gaps), "min_signed_clearance_m": min(gaps), "penetrating_samples": sum(g < -1e-5 for g in gaps)}
        report["worst_clearances"] = sorted(worst, key=lambda w: w["gap_m"])[:30]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    np.save(out / "body_vertices.npy", vertices)
    (out / "geometry.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "sections"}, indent=2), flush=True)


if __name__ == "__main__":
    if "--" in sys.argv:
        sys.argv = [sys.argv[0]] + sys.argv[sys.argv.index("--") + 1:]
    main()

"""Build ONE isolated Test 2 GLB by editing the existing saved body buffer.

No character generator, garment builder, Blender mesh reconstruction, or new
topology. Test 1, current game assets and head buffers remain untouched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE / "characters"))
from emilia_v3_test2_surface import solve_surface
from gltf_parts import read_glb, write_glb
from validate_emilia_export import values


def log(message):
    print(f"[test2-build {time.monotonic():.3f}] {message}", flush=True)


def normals(co, triangles):
    points = co[triangles]
    fn = np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-15)
    result = np.zeros_like(co)
    for i in range(3):
        u = points[:, (i + 1) % 3] - points[:, i]
        v = points[:, (i + 2) % 3] - points[:, i]
        cs = np.einsum("ij,ij->i", u, v) / np.maximum(np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1), 1e-15)
        np.add.at(result, triangles[:, i], fn * np.arccos(np.clip(cs, -1, 1))[:, None])
    return result / np.maximum(np.linalg.norm(result, axis=1, keepdims=True), 1e-15)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out = Path(args.out).resolve()
    first = ROOT / "docs/model-reviews/emilia-arc6-v3-first-geometry-test"
    lock = json.loads((out / "rollback-lock.json").read_text())
    def file_checks():
        return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in lock["sha256"].items()}
    assert all(file_checks().values())
    source = first / "body-before-v3.glb"
    doc, raw = read_glb(source)
    source_data = np.load(first / "vertex-lock.npz")
    before, provenance = source_data["before"], source_data["provenance"]
    height = json.loads((first / "geometry-test.json").read_text())["height"]
    node = next(n for n in doc["nodes"] if n.get("name") == "emilia_v3_test_body")
    primitive = doc["meshes"][node["mesh"]]["primitives"][0]
    pidx, nidx = (primitive["attributes"][k] for k in ("POSITION", "NORMAL"))
    co = values(doc, raw, pidx)[:, [0, 2, 1]].astype(float)
    co[:, 1] *= -1
    err, mapping = cKDTree(before).query(co)
    assert err.max() == 0 and len(set(mapping)) == len(before)
    triangles = mapping[values(doc, raw, primitive["indices"]).reshape((-1, 3))]
    diagnosis = json.loads((out / "test1-diagnosis.json").read_text())
    projection = max(r[1] for r in diagnosis["complete_side_curve"]["rows"])
    log("reuse existing complete body GLB; zero character or garment rebuilds")
    log("solve whole anterior surface and complete side arc together")
    after, free, fit, curve = solve_surface(before, triangles, provenance, height, projection)
    log(f"surface solved: {fit['changed_vertices']} changed y coordinates; all x/z and protected vertices exact")
    binary = bytearray(raw)
    pos = values(doc, binary, pidx)
    pos[:, 0], pos[:, 1], pos[:, 2] = after[mapping, 0], after[mapping, 2], -after[mapping, 1]
    normal = normals(after, triangles)
    touched_triangles = triangles[np.any(free[triangles], axis=1)]
    affected = np.zeros(len(before), dtype=bool)
    affected[np.unique(touched_triangles)] = True
    nv = values(doc, binary, nidx)
    affected_export = affected[mapping]
    nv[affected_export] = normal[mapping[affected_export]][:, [0, 2, 1]]
    nv[affected_export, 2] *= -1
    # Every accessor outside body position/normal, and every original index,
    # remains byte-identical, including existing head, ears and materials.
    identical = {}
    for i in range(len(doc["accessors"])):
        assert np.isfinite(values(doc, binary, i)).all()
        if i not in (pidx, nidx):
            identical[str(i)] = values(doc, binary, i).tobytes() == values(doc, raw, i).tobytes()
    assert all(identical.values())
    node.setdefault("extras", {})["torso_surface"] = "isolated_v3_test2_global_curvature_solve"
    node["extras"]["geometry_test"] = 2
    dest = out / "body-test2.glb"
    log("write isolated body-test2.glb, existing topology and head preserved")
    write_glb(dest, doc, binary)
    np.savez_compressed(out / "vertex-lock-test2.npz", before=before, after=after, free=free,
                        provenance=provenance, triangles=triangles, export_mapping=mapping)
    samples = np.linspace(fit["side_curve"]["lower_z_over_H"], fit["side_curve"]["upper_z_over_H"], 801)
    curve_rows = np.c_[samples, curve(samples), curve.derivative()(samples),
                       curve.derivative(2)(samples) / (1 + curve.derivative()(samples) ** 2) ** 1.5]
    report = {"test": 2, "resulting_shape_approved": False, "height": height,
              "source": str(source.relative_to(ROOT)), "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "test_glb_sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
              "source_character_build_count": 0, "garment_build_count": 0, "isolated_glb_writes": 1,
              "topology_indices_sha256_before": hashlib.sha256(values(doc, raw, primitive["indices"]).tobytes()).hexdigest(),
              "topology_indices_sha256_after": hashlib.sha256(values(doc, binary, primitive["indices"]).tobytes()).hexdigest(),
              "other_accessors_byte_identical": identical, "locked_file_checks": file_checks(), "fit": fit,
              "complete_side_hypothesis": {"columns": ["z/H", "depth/H", "depth_slope", "signed_curvature_times_H"], "rows": curve_rows.tolist()}}
    assert all(report["locked_file_checks"].values())
    (out / "geometry-test2.json").write_text(json.dumps(report, indent=2) + "\n")
    log(f"DONE, GLB {dest.stat().st_size} bytes, {fit['fixed_vertices']} body vertices locked")


if __name__ == "__main__":
    main()

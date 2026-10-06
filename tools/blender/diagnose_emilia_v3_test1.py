"""Read-only Test 1 construction diagnosis before Geometry Test 2.

Original Test 1 renders remain historical regression evidence. No anatomy
target comes from those renders, old models, S1 cups or hidden S4 cloth depth.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.interpolate import CubicSpline

from validate_emilia_export import read_glb, values

ROOT = Path(__file__).resolve().parents[2]
FIRST = ROOT / "docs/model-reviews/emilia-arc6-v3-first-geometry-test"
OUT = ROOT / "docs/model-reviews/emilia-arc6-v3-geometry-test-2"


def anterior_profile(path, height, count=601):
    doc, raw = read_glb(path)
    node = next(n for n in doc["nodes"] if n.get("name") == "emilia_v3_test_body")
    p = doc["meshes"][node["mesh"]]["primitives"][0]
    co = values(doc, raw, p["attributes"]["POSITION"])[:, [0, 2, 1]].astype(float) / height
    co[:, 1] *= -1
    tri = co[values(doc, raw, p["indices"]).reshape((-1, 3))]
    edges = np.concatenate((tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]))
    rows = []
    for z in np.linspace(.675, .812, count):
        dz = edges[:, 1, 2] - edges[:, 0, 2]
        mask = (np.abs(dz) > 1e-12) & (np.minimum(edges[:, 0, 2], edges[:, 1, 2]) <= z) & (np.maximum(edges[:, 0, 2], edges[:, 1, 2]) >= z)
        e = edges[mask]
        t = (z - e[:, 0, 2]) / (e[:, 1, 2] - e[:, 0, 2])
        pts = e[:, 0] + t[:, None] * (e[:, 1] - e[:, 0])
        rows.append((z, float(np.max(.006 - pts[:, 1]))))
    return np.array(rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    r = json.loads((FIRST / "geometry-test.json").read_text())
    a = np.array(r["fit"]["section_fit"])
    profile = anterior_profile(FIRST / "body-v3-test.glb", r["height"])
    curve = CubicSpline(profile[:, 0], profile[:, 1])
    z = np.linspace(.676, .811, 1501)
    tangent = np.degrees(np.arctan(curve(z, 1)))
    curvature = curve(z, 2) / (1 + curve(z, 1) ** 2) ** 1.5
    region = []
    for name, lo, hi in (("lower return", .688, .734), ("crest", .740, .767), ("upper onset", .775, .801)):
        m = (z >= lo) & (z <= hi)
        region.append({"region": name, "z_over_H": [lo, hi],
                       "tangent_min_degrees": float(tangent[m].min()), "tangent_max_degrees": float(tangent[m].max()),
                       "median_abs_curvature_times_H": float(np.median(np.abs(curvature[m]))),
                       "max_abs_curvature_times_H": float(np.max(np.abs(curvature[m])))})
    broad = 20 * .02 / (5 * .38) ** 2
    compact = 20 * .14 / (5 * .10) ** 2
    hit = a[:, 4] >= 1 - 1e-7
    diagnosis = {"before_geometry_test_2": True, "geometry_changed": False,
                 "test_1_corrected_verdicts": {"FRONT": "MAJOR DEVIATION", "3/4": "MAJOR DEVIATION", "SIDE": "MAJOR DEVIATION", "curvature": "FAILED"},
                 "withdrawn_evidence": "Test 1 side landmark agreement is not evidence of a close shape.",
                 "causes": [
                    "Independent side-depth samples copied the simplified magenta path as literal geometry. No full-curve tangent or curvature constraint governed the onset, crest and return.",
                    "The transverse support fit saturated its broad template. Its medial curvature coefficient is 0.1108, versus 11.2 for the compact template. The forced broad template flattened the center and concentrated turning laterally.",
                    "The entire point was reparameterized, including x, before applying an arm-window mask. This narrowed some inner sections while pinning the outer graft.",
                    "Multiplying displacement by height/window masks retained the old off-center depth during the lower join. Mathematical interpolation continuity did not remove perceptual pockets or the band.",
                    "The review compared scalar supports and landmark placement, rather than the full projected silhouette and surface normal distribution."],
                 "shared_construction_problem": "Separately fitted scalar contours plus a bounded section template never formed a globally curvature-controlled surface. The frontal slab and side wedge are coupled failures of this construction.",
                 "transverse_limit": {"anterior_samples_at_bound": int(hit.sum()), "sample_count": len(a),
                                      "z_over_H": [float(a[hit, 0].min()), float(a[hit, 0].max())],
                                      "compact_medial_curvature_coefficient": compact, "broad_medial_curvature_coefficient": broad},
                 "complete_side_curve": {"source": "actual Test 1 GLB triangle cuts, all body vertices", "samples": len(profile),
                                         "columns": ["z/H", "maximum_front_depth/H"], "rows": profile.tolist(), "regions": region},
                 "test_2_method": "Reuse saved pre-test mesh. Replace the anterior distribution with a final-surface variational solve constrained by a complete C2 side curve and fixed boundary collars. Keep every x/z coordinate and all non-torso vertices fixed. No old template bounds, literal magenta fitting or masked old pocket interpolation.",
                 "test_2_experimental_control": "Retain Test 1 maximum projection as a controlled magnitude while testing curvature distribution. This magnitude is unapproved and receives no anatomical support from landmark agreement or clothing.",
                 "source_glb_sha256": hashlib.sha256((FIRST / "body-v3-test.glb").read_bytes()).hexdigest()}
    (OUT / "test1-diagnosis.json").write_text(json.dumps(diagnosis, indent=2) + "\n")
    (FIRST / "review-correction.json").write_text(json.dumps({"supersedes": "SIDE SMALL DEVIATION classification in original Test 1 sheets and report", "SIDE": "MAJOR DEVIATION", "FRONT": "MAJOR DEVIATION", "3/4": "MAJOR DEVIATION", "curvature": "FAILED", "reason": "Wedge silhouette, straight/sloped onset, concentrated crest, diagonal return. Whole-curve curvature fails despite close landmark coordinates.", "original_outputs_preserved": True, "full_diagnosis": "../emilia-arc6-v3-geometry-test-2/test1-diagnosis.json"}, indent=2) + "\n")

    fig, ax = plt.subplots(1, 3, figsize=(15, 5), dpi=160)
    ax[0].plot(profile[:, 1], profile[:, 0], color="#B33B48", lw=2)
    ax[0].set(xlabel="Anterior depth / H", ylabel="Height / H", title="Test 1 whole side silhouette")
    ax[0].set_aspect("equal", adjustable="datalim")
    ax[1].plot(z, tangent, color="#B33B48", lw=1.5)
    ax[1].set(xlabel="Height / H", ylabel="Tangent angle (degrees)", title="Direction between landmarks")
    ax[2].plot(z, curvature, color="#B33B48", lw=1.5)
    ax[2].set(xlabel="Height / H", ylabel="Signed curvature × H", title="Curvature along the whole curve")
    for aplot in ax:
        aplot.grid(alpha=.18)
    fig.suptitle("Test 1 diagnosis: SIDE = MAJOR DEVIATION, curvature = FAILED", weight="bold")
    fig.text(.5, .02, "Construction diagnosis only. Historical model contours are not anatomical targets.", ha="center", fontsize=10)
    fig.tight_layout(rect=(0, .05, 1, .94))
    stream = io.BytesIO()
    fig.savefig(stream, format="png")
    (OUT / "test1-complete-curve-diagnosis.png").write_bytes(stream.getvalue())
    plt.close(fig)
    print(json.dumps({"anterior_bound_samples": int(hit.sum()), "side_curve_samples": len(profile), "corrected_SIDE": "MAJOR DEVIATION", "geometry_changed": False, "regions": region}))


if __name__ == "__main__":
    main()

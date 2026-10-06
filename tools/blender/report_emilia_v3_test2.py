"""Read-only Test 2 review. Whole curves, frozen concept and seven cameras.

No render, generator, surface solver or garment builder is called here.
Historical Test 1 curves/images are regression evidence only.
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
from scipy.signal import savgol_filter

from analyze_emilia_references import Sheet, INK, MUTED, G
from analyze_emilia_references_v3 import proposal
from diagnose_emilia_v3_test1 import anterior_profile
from report_emilia_v3_test import put_image, glb_sections

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/model-reviews/emilia-arc6-v3-geometry-test-2"
FIRST = ROOT / "docs/model-reviews/emilia-arc6-v3-first-geometry-test"
FROZEN = ROOT / "docs/model-reviews/emilia-arc6-v3-s4-cross-validation/frozen-guide-v3.json"
RED, BLUE = "#B33B48", "#1479A1"
VIEWS = ("front", "three_quarter", "side", "low_front", "full_front", "full_side", "curvature_three_quarter")
LABELS = ("FRONT", "3/4 | 40 degrees", "TRUE SIDE | 90 degrees", "LOW FRONT | -14 degrees", "FULL FRONT", "FULL SIDE", "CURVATURE | smooth-lit 3/4")


def save(sheet, name):
    stream = io.BytesIO()
    sheet.image.save(stream, format="PNG")
    (OUT / (name + ".png")).write_bytes(stream.getvalue())
    (OUT / (name + ".svg")).write_text("\n".join(sheet.svg + ["</svg>"]))


def curve_measurements(path, height):
    raw = anterior_profile(path, height, count=801)
    dz = raw[1, 0] - raw[0, 0]
    # Derivative measurement only. Raw mesh silhouette is shown unchanged.
    # A local polynomial removes triangle-frequency derivative spikes at a
    # documented fixed scale, identically for Test 1 and Test 2.
    width, order = 31, 3
    d1 = savgol_filter(raw[:, 1], width, order, deriv=1, delta=dz)
    d2 = savgol_filter(raw[:, 1], width, order, deriv=2, delta=dz)
    tangent = np.degrees(np.arctan(d1))
    curvature = d2 / (1 + d1 * d1) ** 1.5
    rows = np.c_[raw, tangent, curvature]
    regions = []
    for name, lo, hi in (("lower return", .688, .734), ("fullest arc", .740, .767), ("upper onset", .775, .801)):
        mask = (raw[:, 0] >= lo) & (raw[:, 0] <= hi)
        regions.append({"region": name, "z_over_H": [lo, hi],
                        "tangent_min_degrees": float(tangent[mask].min()),
                        "tangent_max_degrees": float(tangent[mask].max()),
                        "median_abs_curvature_times_H": float(np.median(abs(curvature[mask]))),
                        "maximum_abs_curvature_times_H": float(np.max(abs(curvature[mask])))})
    return rows, {"scope": "actual complete exported body silhouette from triangle-plane cuts; no landmark-only verdict",
                  "samples": len(raw), "columns": ["z/H", "maximum_front_depth/H", "tangent_degrees", "signed_curvature_times_H"],
                  "rows": rows.tolist(), "regions": regions,
                  "derivative_method": {"name": "local cubic Savitzky-Golay measurement", "window_samples": width,
                                        "window_span_over_H": float((width - 1) * dz),
                                        "same_for_both_tests": True, "mesh_smoothing_or_edit": False,
                                        "raw_silhouette_plotted_without_filter": True}}


def complete_curve_chart(geometry):
    first, r1 = curve_measurements(FIRST / "body-v3-test.glb", geometry["height"])
    second, r2 = curve_measurements(OUT / "body-test2.glb", geometry["height"])
    analytic = np.array(geometry["complete_side_hypothesis"]["rows"])
    fig, axes = plt.subplots(1, 3, figsize=(15, 6.2), dpi=160)
    for arr, label, color in ((first, "Test 1 (failed)", RED), (second, "Test 2 (unapproved)", BLUE)):
        axes[0].plot(-arr[:, 1], arr[:, 0], color=color, lw=2, label=label)
        axes[1].plot(arr[:, 0], arr[:, 2], color=color, lw=1.8)
        axes[2].plot(arr[:, 0], arr[:, 3], color=color, lw=1.8)
    axes[0].plot(-analytic[:, 1], analytic[:, 0], color=BLUE, lw=1, ls="--", alpha=.6, label="Test 2 spline constraint")
    axes[0].set_aspect("equal", adjustable="datalim")
    axes[0].set(xlabel="Anterior coordinate / H (front at left)", ylabel="Height / H", title="Complete raw GLB silhouette")
    axes[1].set(xlabel="Height / H", ylabel="Tangent angle (degrees)", title="Direction between landmarks")
    axes[2].set(xlabel="Height / H", ylabel="Signed curvature x H", title="Curvature across the whole arc")
    axes[0].legend(fontsize=8)
    for ax in axes:
        ax.grid(alpha=.2)
    fig.suptitle("Test 2: SIDE = MAJOR DEVIATION. Curvature = FAILED.", weight="bold")
    fig.text(.5, .025, "Historical Test 1 is a regression comparison only. Derivatives use identical 0.00514 H measurement windows. No mesh smoothing.", ha="center", fontsize=9)
    fig.tight_layout(rect=(0, .065, 1, .94))
    stream = io.BytesIO()
    fig.savefig(stream, format="png")
    (OUT / "emilia-test2-complete-curves.png").write_bytes(stream.getvalue())
    plt.close(fig)
    return {"test1": r1, "test2": r2}


def main():
    geometry = json.loads((OUT / "geometry-test2.json").read_text())
    frozen = json.loads(FROZEN.read_text())
    audit = json.loads((OUT / "mesh-audit.json").read_text())
    lock = json.loads((OUT / "rollback-lock.json").read_text())
    locked = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == digest for p, digest in lock["sha256"].items()}
    assert all(locked.values())
    cameras, camera_checks = {}, {}
    for view in VIEWS:
        current = json.loads((OUT / "renders" / (view + ".json")).read_text())
        original = json.loads((FIRST / "renders" / (view + ".json")).read_text())
        keys = ("view", "projection", "azimuth", "elevation", "target", "scale", "resolution", "arm_sweep_degrees", "lighting")
        camera_checks[view] = all(current[k] == original[k] for k in keys)
        assert camera_checks[view]
        assert current["source_glb_sha256"] == geometry["test_glb_sha256"]
        cameras[view] = current
    data = np.load(OUT / "vertex-lock-test2.npz")
    assert np.array_equal(data["before"][~data["free"]], data["after"][~data["free"]])
    assert np.array_equal(data["before"][:, [0, 2]], data["after"][:, [0, 2]])
    sections = glb_sections(OUT / "body-test2.glb", data["after"], data["provenance"], geometry["height"])
    curves = complete_curve_chart(geometry)
    guide_verdicts = [
        {"guide": "FRONT", "result": "MAJOR DEVIATION", "reason": "Broad anterior reading, bowl-like central shading and a visible lower band interrupt the continuous torso. Locked front silhouette alone cannot establish a match."},
        {"guide": "3/4", "result": "MAJOR DEVIATION", "reason": "The surface turns more progressively than the Test 1 template, but the lower band, concentrated front volume and retained axillary pinch still interrupt the wrap."},
        {"guide": "SIDE", "result": "MAJOR DEVIATION", "reason": "The crest is rounder than Test 1, but onset still reads as an extended slope and the return is too direct before a separate lower bend. Complete curvature fails, despite the smooth spline and controlled landmarks."},
    ]
    failure_modes = [
        {"mode": "Front dome", "result": "MAJOR DEVIATION", "finding": "No primitive dome was added. The body still reads as an isolated broad anterior volume."},
        {"mode": "Attached lobes", "result": "SMALL DEVIATION", "finding": "One connected mesh, no added anterior objects. Paired lower shading pockets remain at the retained transition."},
        {"mode": "Lower shelf / band", "result": "MAJOR DEVIATION", "finding": "Band persists in front, low front and curvature-lit 3/4. Fixed collar values and minimum bending energy do not prevent this visible curvature change."},
        {"mode": "Center flattening / depression", "result": "MAJOR DEVIATION", "finding": "Front still reads broadly across the center with dark bowl-like shading. Convex transverse inequalities prevent a new off-center depth maximum within the free region, but do not make the rendered form convincing."},
        {"mode": "Abrupt side bulge / wedge", "result": "MAJOR DEVIATION", "finding": "Rounder crest is insufficient. Sloped onset, concentrated projection and direct lower return retain the wedge-like reading."},
        {"mode": "S-shaped lower return", "result": "MAJOR DEVIATION", "finding": "Longitudinal derivative is monotone inside the new spline, yet the whole silhouette still has a distinct inward return and lower bend."},
        {"mode": "Armpit pinching", "result": "MAJOR DEVIATION", "finding": "Pinching remains in the immutable shoulder/arm graft. No shoulder or arm coordinates changed."},
        {"mode": "Surface intersections", "result": "MATCHES GUIDE", "finding": "Complete-body audit reports zero transverse intersections, boundary edges, nonmanifold edges or degenerate faces. Coplanar/shared-vertex contacts are excluded from that intersection test."},
    ]
    report = {"test": 2, "status": "GEOMETRY_TEST_2_COMPLETE_UNAPPROVED", "overall": "MAJOR DEVIATION", "curvature": "FAILED",
              "guide_verdicts": guide_verdicts, "failure_modes": failure_modes,
              "matches_guide": ["One connected torso, no separate front objects", "Upper-torso-only edits, all protected positions exact", "No topology change or detected transverse intersections"],
              "small_deviation": ["Rounder crest and less abrupt transverse turn relative to failed Test 1; both full-view verdicts remain MAJOR DEVIATION"],
              "major_deviation": ["Front band and bowl-like central reading", "Oblique wrap interrupted by lower curvature change", "Whole side onset / crest / return and retained wedge reading", "Retained locked armpit pinching"],
              "construction_change": "Replaced bounded transverse templates and masked displacement with a globally constrained final-surface bending solve. One fifth-degree side spline is constrained and evaluated across its complete arc. Existing topology and x/z coordinates stay fixed.",
              "why_it_is_not_a_pass": "A smooth central spline, transverse convexity and low bending energy do not establish the desired two-dimensional surface-normal distribution. They still permit a broad anterior region, a perceptual lower band and a direct side return. Holding Test 1's unapproved projection magnitude was an experimental control, not reference support. This test does not validate that magnitude or the resulting silhouette.",
              "guide_use": "Frozen V3 transition behavior only. No numeric registration of simplified magenta drawings, no guide refit to mesh.",
              "guide_payload_sha256": frozen["guide_payload_sha256"],
              "frozen_guide_file_sha256": hashlib.sha256(FROZEN.read_bytes()).hexdigest(),
              "locked_files": locked, "protected_vertex_changes": 0, "camera_checks_identical_to_test1": camera_checks,
              "render_results": cameras, "complete_curve_analysis": curves, "export_sections": sections, "mesh_audit": audit,
              "reference_hierarchy": "Supplied official S4 remains authoritative. S1 neutral sheet is secondary structure only. No fan measurements, white-garment hidden depth, S1 cup-edge body target, or old model anatomical targets.",
              "next_action": "STOP for user review. No garment work, no further surface correction, no promotion to game character asset."}
    (OUT / "review-test2.json").write_text(json.dumps(report, indent=2) + "\n")

    s = Sheet(2100, 1080)
    s.text(40, 25, "Emilia | Geometry Test 2 against frozen V3", 40, INK, True)
    s.text(40, 82, "BODY ONLY. V3 describes transition behavior. Its original paths have not been refitted to the mesh.", 23, MUTED)
    notes = [
        ["Lower band and bowl-like center remain.", "Front silhouette and curvature do not pass."],
        ["Wrap is still interrupted by the lower band.", "Locked armpit pinching remains visible."],
        ["Rounder crest does not solve the full curve.", "Sloped onset and direct return still fail."],
    ]
    for i, (view, guide, verdict) in enumerate(zip(VIEWS[:3], frozen["guide_paths"], guide_verdicts)):
        x, y = 40 + i * 683, 134
        s.rect(x, y, 655, 807)
        s.text(x + 20, y + 18, guide["title"], 29, INK, True)
        s.text(x + 20, y + 67, "TEST 2 / FIXED CAMERA", 17, MUTED)
        s.text(x + 438, y + 67, "FROZEN V3", 17, G, True)
        put_image(s, OUT / "renders" / (view + ".png"), x + 15, y + 109, 398, 478)
        proposal(s, guide, x + 428, y + 116, 200, 435)
        s.text(x + 427, y + 570, "Concept only", 17, G)
        s.text(x + 20, y + 626, verdict["result"], 24, RED, True)
        s.lines(x + 20, y + 683, notes[i], 20, spacing=36)
    s.text(40, 968, "CURVATURE: FAILED. No side verdict is based solely on onset / crest / return coordinates.", 23, RED, True)
    s.text(40, 1018, "Guide diagrams are unscaled. Original 3/4 sketch orientation retained. SIDE diagram is reflected for display only.", 20, MUTED)
    save(s, "emilia-test2-frozen-guide")

    s = Sheet(2400, 1740)
    s.text(35, 25, "Emilia | Geometry Test 2, seven body-only views", 41, INK, True)
    s.text(35, 85, "Same orthographic cameras and lighting as Test 1. No garment, hair or cape. Result unapproved.", 25, MUTED)
    for i, (view, label) in enumerate(zip(VIEWS, LABELS)):
        x, y = 25 + (i % 4) * 595, 139 + (i // 4) * 790
        s.rect(x, y, 570, 763)
        s.text(x + 17, y + 18, label, 23, INK, True)
        put_image(s, OUT / "renders" / (view + ".png"), x + 10, y + 63, 550, 660)
        s.text(x + 18, y + 730, "TEST 2 / UNAPPROVED", 17, RED, True)
    x, y = 1810, 929
    s.rect(x, y, 570, 763)
    s.text(x + 22, y + 24, "REVIEW", 29, INK, True)
    s.lines(x + 22, y + 82, ["FRONT: MAJOR DEVIATION", "3/4: MAJOR DEVIATION", "SIDE: MAJOR DEVIATION", "CURVATURE: FAILED", "", "Remaining defects", "Lower band / paired pockets", "Bowl-like central shading", "Sloped side onset", "Direct lower return", "Locked armpit pinching", "", "Protected work", "22,393 body vertices exact", "All x/z coordinates exact", "No topology changes", "No detected intersections", "No character or garment rebuild", "", "STOP FOR REVIEW"], 21, spacing=31)
    save(s, "emilia-test2-seven-views")

    s = Sheet(2520, 1870)
    s.text(35, 25, "Emilia | failed Test 1 versus unapproved Test 2", 40, INK, True)
    s.text(35, 83, "Regression comparison only. Historical meshes and renders supply no anatomical targets.", 24, MUTED)
    for i, (view, label) in enumerate(zip(VIEWS, LABELS)):
        x, y = 20 + (i % 4) * 625, 139 + (i // 4) * 820
        s.rect(x, y, 606, 787)
        s.text(x + 16, y + 17, label, 22, INK, True)
        s.text(x + 15, y + 66, "TEST 1 / FAILED", 17, RED, True)
        s.text(x + 320, y + 66, "TEST 2 / UNAPPROVED", 17, BLUE, True)
        put_image(s, FIRST / "renders" / (view + ".png"), x + 7, y + 107, 293, 638)
        put_image(s, OUT / "renders" / (view + ".png"), x + 306, y + 107, 293, 638)
    x, y = 1895, 959
    s.rect(x, y, 606, 787)
    s.text(x + 24, y + 28, "NO PASS CLAIM", 28, RED, True)
    s.lines(x + 24, y + 90, ["Rounder crest is a local change.", "It does not validate the side curve.", "", "All three primary views remain", "MAJOR DEVIATION.", "", "Lower band persists.", "Surrounding anatomy stays exact.", "Original outputs stay intact.", "", "Same camera, pose and lighting", "for every corresponding pair.", "", "No follow-up mesh edit was made", "after inspecting these renders."], 23, spacing=38)
    s.text(35, 1805, "Download native 600 x 720 PNGs for close inspection. These comparison cells keep identical camera framing.", 23, MUTED)
    save(s, "emilia-test2-regression")
    print(json.dumps({"guide_verdicts": guide_verdicts, "curvature": "FAILED", "all_camera_checks": all(camera_checks.values()),
                      "all_locked_files": all(locked.values()), "detected_intersections": audit["surface_crossings"]["crossing_pairs"],
                      "next_action": report["next_action"]}), flush=True)


if __name__ == "__main__":
    main()

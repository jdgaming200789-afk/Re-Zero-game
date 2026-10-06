"""Present the completed, unapproved V3 experiment beside unchanged guides.

Read-only analysis of existing GLBs / PNGs. No bpy, rebuild, or geometry edits.
Old body renders occur only in the explicit regression comparison sheet.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

from analyze_emilia_references import Sheet, INK, MUTED, LINE, G
from analyze_emilia_references_v3 import proposal
from validate_emilia_export import read_glb, values

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/model-reviews/emilia-arc6-v3-first-geometry-test"
FROZEN = ROOT / "docs/model-reviews/emilia-arc6-v3-s4-cross-validation/frozen-guide-v3.json"
RED, GREEN, AMBER = "#B33B48", "#187566", "#A86B16"


def save_sheet(sheet, filename):
    stream = io.BytesIO()
    sheet.image.save(stream, format="PNG")
    (OUT / (filename + ".png")).write_bytes(stream.getvalue())
    (OUT / (filename + ".svg")).write_text("\n".join(sheet.svg + ["</svg>"]))


def put_image(sheet, path, x, y, width, height):
    with Image.open(path) as image:
        image.load()
        scale = min(width / image.width, height / image.height)
        size = (round(image.width * scale), round(image.height * scale))
        rgb = Image.new("RGBA", image.size, "#252A32")
        rgb.alpha_composite(image.convert("RGBA"))
        rgb = rgb.convert("RGB")
        px, py = round(x + (width - size[0]) / 2), round(y + (height - size[1]) / 2)
        sheet.image.paste(rgb.resize(size, Image.Resampling.LANCZOS), (px, py))
        sheet.draw = ImageDraw.Draw(sheet.image)
        stream = io.BytesIO()
        rgb.save(stream, format="PNG")
        encoded = base64.b64encode(stream.getvalue()).decode()
        sheet.svg.append(f'<image x="{px}" y="{py}" width="{size[0]}" height="{size[1]}" href="data:image/png;base64,{encoded}"/>')


def glb_sections(glb, source, provenance, height):
    doc, raw = read_glb(glb)
    assert not doc.get("skins") and not doc.get("animations")
    for i in range(len(doc["accessors"])):
        assert np.isfinite(values(doc, raw, i)).all()
    node = next(n for n in doc["nodes"] if n.get("name") == "emilia_v3_test_body")
    assert not any(k in node for k in ("matrix", "translation", "rotation", "scale"))
    p = doc["meshes"][node["mesh"]]["primitives"][0]
    positions = values(doc, raw, p["attributes"]["POSITION"])
    # glTF Y-up -> original Blender Z-up, character anterior -Y.
    coords = positions[:, [0, 2, 1]].astype(float)
    coords[:, 1] *= -1
    distance, original_index = cKDTree(source).query(coords)
    assert distance.max() < 2e-7, "Exported vertex no longer matches the tested body"
    grid = np.zeros(len(source), dtype=bool)
    grid[provenance[:, 0].astype(int)] = True
    indices = values(doc, raw, p["indices"]).reshape((-1, 3))
    assert indices.max() < len(coords)
    triangles = coords[indices[np.all(grid[original_index[indices]], axis=1)]] / height
    edges = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    rows = []
    ca, sa = math.cos(math.radians(40)), math.sin(math.radians(40))
    for z in np.linspace(.676, .810, 68):
        delta = edges[:, 1, 2] - edges[:, 0, 2]
        mask = (np.abs(delta) > 1e-12) & (np.minimum(edges[:, 0, 2], edges[:, 1, 2]) <= z) & (np.maximum(edges[:, 0, 2], edges[:, 1, 2]) >= z)
        section = edges[mask]
        t = (z - section[:, 0, 2]) / (section[:, 1, 2] - section[:, 0, 2])
        points = section[:, 0] + t[:, None] * (section[:, 1] - section[:, 0])
        depth = .006 - points[:, 1]
        medial = np.abs(points[:, 0]) < .0003
        rows.append([float(z), float(np.max(np.abs(points[:, 0]))),
                     float(np.max(depth)), float(np.max(depth[medial])) if medial.any() else None,
                     float(np.max(np.abs(points[:, 0]) * ca + depth * sa)),
                     float(np.max(np.abs(points[:, 0]) * ca - depth * sa))])
    return {"scope": "actual exported central loft triangle cuts; excludes locked arm bridges and limbs",
            "columns": ["z/H", "half_width/H", "maximum_anterior_depth/H", "medial_depth/H", "near_40deg_support/H", "far_40deg_support/H"],
            "rows": rows, "maximum_export_vertex_error_m": float(distance.max()),
            "static_body_only_meshes": [n.get("name") for n in doc["nodes"] if "mesh" in n]}


def main():
    geometry = json.loads((OUT / "geometry-test.json").read_text())
    frozen = json.loads(FROZEN.read_text())
    data = np.load(OUT / "vertex-lock.npz")
    sections = {"before": glb_sections(OUT / "body-before-v3.glb", data["before"], data["provenance"], geometry["height"]),
                "test": glb_sections(OUT / "body-v3-test.glb", data["after"], data["provenance"], geometry["height"])}
    wanted = np.array(geometry["fit"]["section_fit"])
    residuals = []
    for row in sections["test"]["rows"]:
        z = row[0]
        targets = [float(np.interp(z, wanted[:, 0], wanted[:, i])) for i in (1, 2, 6, 7)]
        residuals.append([z, row[1] - targets[0], row[2] - targets[1], row[4] - targets[2], row[5] - targets[3]])
    residuals = np.array(residuals)
    interior = (residuals[:, 0] >= .706) & (residuals[:, 0] <= .790)
    metrics = {"scope": "registered guide comparison inside active height span; central loft only",
               "error_units": "fractions of H, never official body measurements",
               "columns": ["front_half_width", "side_anterior_depth", "near_40deg_support", "far_40deg_support"],
               "maximum_absolute_error_over_H": np.max(np.abs(residuals[interior, 1:]), axis=0).tolist(),
               "rms_error_over_H": np.sqrt(np.mean(residuals[interior, 1:] ** 2, axis=0)).tolist(),
               "residual_columns": ["z/H", "front_width_error/H", "side_depth_error/H", "near_support_error/H", "far_support_error/H"],
               "residuals": residuals.tolist()}
    # Inspect this finished test rather than silently repairing / rebuilding
    # it. Bound-clamped height controls are a continuity limitation to report.
    from torso_contours import CubicCurve
    shape_limits = {}
    for index, name in ((4, "anterior"), (5, "posterior")):
        curve = CubicCurve(wanted[:, 0], wanted[:, index])
        sampled = np.array([curve(z) for z in np.linspace(.675, .812, 2001)])
        shape_limits[name] = {"unclamped_height_minimum": float(sampled.min()),
                              "unclamped_height_maximum": float(sampled.max()),
                              "clamp_used_in_finished_test": bool(np.any((sampled < 0) | (sampled > 1)))}
    failure_modes = [
        {"mode": "Front dome", "result": "MAJOR DEVIATION", "finding": "Old rounded dome is not recreated as a primitive. The replacement still reads as a single broad anterior mass with a flattened upper turn."},
        {"mode": "Attached lobes", "result": "SMALL DEVIATION", "finding": "No separate objects or two upper-chest centers. Paired lower shading pockets remain near the retained ribcage transition."},
        {"mode": "Lower shelf / band", "result": "MAJOR DEVIATION", "finding": "Visible horizontal transition survives in front, low-front and oblique views. C2 mathematical joins did not remove its perceptual shelf."},
        {"mode": "Center flattening / depression", "result": "MAJOR DEVIATION", "finding": "Upper front looks flat across a broad span. A lower medial indentation remains inside the blend to the retained ribcage."},
        {"mode": "Abrupt side bulge", "result": "MAJOR DEVIATION", "finding": "Projection is bounded vertically, but the upper turn reads too concentrated / blunt in the true-side render."},
        {"mode": "S-shaped lower return", "result": "MAJOR DEVIATION", "finding": "The intended long central return is present, but the lower blend still has a separate visible bend / band. Smoothness is not adequate."},
        {"mode": "Armpit pinching", "result": "MAJOR DEVIATION", "finding": "Locked shoulder / arm bridges retain visible pinching from the current baseline. None were widened or repositioned."},
        {"mode": "Surface intersections", "result": "MATCHES GUIDE", "finding": "Complete-body triangle audit found zero transverse intersections; mesh remains closed, manifold and nondegenerate."},
    ]
    verdicts = [
        {"guide": "FRONT", "result": "MAJOR DEVIATION", "reason": "Outer fullness is constrained by the locked arm graft. The interior turns into a broad flat band. No simultaneous clean torso match."},
        {"guide": "3/4", "result": "MAJOR DEVIATION", "reason": "Near wrap is visible, but upper planar shading, lower band and axillary pinch interrupt one continuous form."},
        {"guide": "SIDE", "result": "SMALL DEVIATION", "reason": "Registered maximum projection and central return follow the hypothesis closely. Upper onset and the lower blend still fail the requested smooth reading."},
    ]
    report = {"status": "FIRST_GEOMETRY_TEST_COMPLETE_UNAPPROVED", "overall": "MAJOR DEVIATION",
              "next_action": "STOP for user review; no garment fitting or additional mesh adjustment",
              "guide_digest_unchanged": frozen["guide_payload_sha256"],
              "guide_file_sha256_unchanged": hashlib.sha256(FROZEN.read_bytes()).hexdigest() == geometry["fit"]["frozen_file_sha256"],
              "guide_verdicts": verdicts, "failure_modes": failure_modes,
              "matches_guide": ["One existing connected torso surface; no added anterior objects", "Bounded projection landmark and central long return", "Surrounding vertex locks and zero body intersections"],
              "small_deviation": ["Registered true-side guide positions; this does not approve its curvature", "Residual paired lower pockets, rather than independent upper lobes"],
              "major_deviation": ["Front and oblique surface reading", "Horizontal band / shelf and center flattening", "Blunt upper side turn and lower return bend", "Retained armpit pinching"],
              "diagnosis": "The section fit saturates its transverse shape bound in part of the upper chest. This produces an overly flat central turn even though its center-side curve follows the guide. Height and arm-window masks preserve surrounding vertices but retain off-center lower depth and restrict outer wrap. Periodic C2 transverse sections alone do not ensure a convincing blended torso. The height shape clamp also limits a global C2 claim. This experiment is preserved, not corrected incrementally.",
              "shape_interpolation_limitations": shape_limits,
              "registration_caveat": "V3 is a schematic hypothesis without physical scale. The documented registration was fixed before mesh movement; it is not an anatomical measurement or permission to infer concealed body depth from clothing.",
              "pose_caveat": "Exact six old camera transforms retained. Arms stay in the current uncut rest pose; unlike the old dressed renderer, no temporary 58-degree arm sweep occurs. Before and test renders share this same pose.",
              "render_results": {name: json.loads((OUT / "renders" / (name + ".json")).read_text()) for name in ("front", "three_quarter", "side", "low_front", "full_front", "full_side", "curvature_three_quarter")},
              "guide_metrics": metrics, "export_sections": sections}
    (OUT / "review-report.json").write_text(json.dumps(report, indent=2) + "\n")

    s = Sheet(2100, 1030)
    s.text(45, 26, "Emilia | frozen V3 first geometry test", 42, INK, True)
    s.text(45, 83, "BODY ONLY. One connected loft. Result unapproved. Frozen guide paths remain unchanged.", 25, MUTED)
    names = ("front", "three_quarter", "side")
    notes = [
        ["Outer width remains constrained near the arm graft.", "Broad front band and lower pockets remain."],
        ["Upper planar turn interrupts the ribcage wrap.", "Lower band and retained armpit pinch remain."],
        ["Projection landmarks track the registered guide.", "Onset and lower join still read too distinctly."],
    ]
    for i, (name, guide, verdict) in enumerate(zip(names, frozen["guide_paths"], verdicts)):
        x, y = 45 + i * 680, 136
        s.rect(x, y, 650, 765)
        s.text(x + 20, y + 19, guide["title"], 29, INK, True)
        s.text(x + 20, y + 65, "TEST GLB / FIXED CAMERA", 18, MUTED)
        s.text(x + 433, y + 65, "FROZEN V3", 18, G, True)
        put_image(s, OUT / "renders" / (name + ".png"), x + 15, y + 105, 398, 478)
        proposal(s, guide, x + 421, y + 117, 207, 440)
        s.text(x + 423, y + 570, "Original hypothesis", 16, G)
        s.text(x + 20, y + 610, verdict["result"], 24, RED if verdict["result"] == "MAJOR DEVIATION" else AMBER, True)
        s.lines(x + 20, y + 660, notes[i], 20, spacing=34)
    s.text(45, 922, "MATCHES GUIDE: one surface; bounded side crest; no body intersections. Full shape match is not achieved.", 22, GREEN, True)
    s.text(45, 962, "Guide diagrams have no physical scale. 3/4 sketch and fixed camera face opposite ways; paths are not refitted.", 21, MUTED)
    save_sheet(s, "emilia-v3-guide-test")

    s = Sheet(2400, 1730)
    s.text(35, 24, "Emilia | seven body-only diagnostic views", 42, INK, True)
    s.text(35, 83, "Same six orthographic cameras + smooth-lit 3/4. No garments, hair or cape. No arm posing.", 26, MUTED)
    all_names = ("front", "three_quarter", "side", "low_front", "full_front", "full_side", "curvature_three_quarter")
    labels = ("FRONT", "3/4 | 40 degrees", "TRUE SIDE | 90 degrees", "LOW FRONT | -14 degrees", "FULL FRONT", "FULL SIDE", "CURVATURE | smooth-lit 3/4")
    for i, (name, label) in enumerate(zip(all_names, labels)):
        x, y = 25 + (i % 4) * 595, 136 + (i // 4) * 790
        s.rect(x, y, 570, 763)
        s.text(x + 18, y + 18, label, 24, INK, True)
        put_image(s, OUT / "renders" / (name + ".png"), x + 10, y + 63, 550, 660)
        s.text(x + 18, y + 730, "V3 TEST / UNAPPROVED", 17, RED, True)
    x, y = 1810, 926
    s.rect(x, y, 570, 763)
    s.text(x + 22, y + 23, "TEST FINDINGS", 29, INK, True)
    s.lines(x + 22, y + 83, ["Front / oblique: MAJOR DEVIATION", "Side guide: SMALL DEVIATION", "Curvature: test does not pass", "", "Remaining defects", "- Broad horizontal transition", "- Flattened upper front", "- Lower medial indentation", "- Concentrated side turn", "- Retained armpit pinch", "", "Preservation", "- 0 topology changes", "- 16,700 protected body vertices exact", "- Head context unchanged", "- 0 surface intersections", "- 0 garment builds", "", "STOP FOR REVIEW"], 21, spacing=32)
    save_sheet(s, "emilia-v3-seven-views")

    s = Sheet(1800, 1600)
    s.text(35, 23, "Emilia | current rollback body versus V3 test", 37, INK, True)
    s.text(35, 75, "Before images are regression comparisons only. No old render supplied anatomical targets.", 22, MUTED)
    for row, directory in enumerate(("before-renders", "renders")):
        y = 115 + row * 730
        for i, name in enumerate(names):
            x = 25 + i * 593
            s.text(x + 10, y, ("BEFORE / ROLLBACK" if row == 0 else "V3 FIRST TEST") + " | " + ("3/4" if name == "three_quarter" else name.upper()), 22, INK if row == 0 else RED, True)
            put_image(s, OUT / directory / (name + ".png"), x, y + 43, 565, 678)
    save_sheet(s, "emilia-v3-before-after")
    print(json.dumps({"overall": report["overall"], "guide_verdicts": verdicts,
                      "metrics": {k:v for k,v in metrics.items() if k != "residuals"},
                      "sheets": ["emilia-v3-guide-test.png", "emilia-v3-seven-views.png", "emilia-v3-before-after.png"]}))


if __name__ == "__main__":
    main()

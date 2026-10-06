"""A precise TWO-DIMENSIONAL review drawing, not a mesh or surface builder.

Five hand-designed whole-torso sections determine the illustration silhouettes
and construction strokes. Coordinates are drawing pixels, not body measures.
Official reference pixels are embedded unchanged below separate vector marks.
No Blender, GLB reader, vertex data, model code or V3 hypothesis is imported.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import CubicSpline

from analyze_emilia_references import Sheet, INK, MUTED, LINE

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/model-reviews/emilia-arc6-body-reconstruction-proposal"
ORANGE, TEAL, BLUE, FLOW = "#CE7929", "#128472", "#2777C1", "#7BAFC2"
LEVELS = [("A", "UPPER ONSET", 140, 104, 36, 40),
          ("B", "RISING FULLNESS", 180, 114, 53, 42),
          ("C", "FULLEST REGION", 225, 116, 70, 43),
          ("D", "LOWER RETURN", 285, 100, 58, 42),
          ("E", "LOWER RIBCAGE", 345, 87, 43, 40)]
# The waist is drawing context only, and has no future-model authorization.
HEIGHTS = [105, *[a[2] for a in LEVELS], 420]
WIDTH = CubicSpline(HEIGHTS, [110, *[a[3] for a in LEVELS], 79], bc_type="natural")
FRONT = CubicSpline(HEIGHTS, [30, *[a[4] for a in LEVELS], 35], bc_type="natural")
REAR = CubicSpline(HEIGHTS, [37, *[a[5] for a in LEVELS], 38], bc_type="natural")


def cubic(a, b, c, d, count=45):
    t = np.linspace(0, 1, count)[:, None]
    return (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d


def section(w, f, r):
    """One closed perimeter. Positive second coordinate is ANTERIOR depth."""
    controls = [((0, -r), (.46*w, -r), (w, -.64*r), (w, 0)),
                ((w, 0), (w, .44*f), (.62*w, f), (0, f)),
                ((0, f), (-.62*w, f), (-w, .44*f), (-w, 0)),
                ((-w, 0), (-w, -.64*r), (-.46*w, -r), (0, -r))]
    return np.concatenate([cubic(*(np.array(p) for p in control))[:-1] for control in controls])


def project(points, view):
    """Drawing-plane comparison of section width and depth. No 3D arrays."""
    if view == "FRONT":
        return points[:, 0]
    if view == "TRUE SIDE":
        return -points[:, 1]
    a = math.radians(40)
    return points[:, 0] * math.cos(a) - points[:, 1] * math.sin(a)


def polygon(s, points, fill, stroke="#4C5868", width=2):
    pts = [tuple(p) for p in points]
    s.draw.polygon(pts, fill=fill)
    s.draw.line([*pts, pts[0]], fill=stroke, width=width, joint="curve")
    p = " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)
    s.svg.append(f'<polygon points="{p}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round"/>')


def polyline(s, points, color=FLOW, width=2, dashed=False):
    s.path([("M", *points[0]), *[("L", *p) for p in points[1:]]], color, width, dashed=dashed)


def outline(view):
    ys = np.linspace(140, 420, 281)
    cuts = [project(section(float(WIDTH(y)), float(FRONT(y)), float(REAR(y))), view) for y in ys]
    left = np.c_[[c.min() for c in cuts], ys]
    right = np.c_[[c.max() for c in cuts], ys]
    if view == "TRUE SIDE":
        upper = [(-24, 20), (-23, 61), (-25, 80), (-29, 101), (-34, 126)]
        end = [(37, 122), (37, 95), (31, 70), (24, 20)]
    else:
        a, b = (1, 1) if view == "FRONT" else (.77, 1.02)
        upper = [(-25, 20), (-25, 61), (-31, 72), (-59*a, 79), (-99*a, 91),
                 (-139*a, 99), (-154*a, 121), (-173*a, 158), (-157*a, 169),
                 (-141*a, 151), (-126*a, 125), (left[0, 0]-6, 126)]
        end = [(right[0, 0]+6, 126), (125*b, 125), (142*b, 151), (158*b, 169),
               (174*b, 158), (154*b, 120), (140*b, 99), (99*b, 91),
               (59*b, 79), (31, 72), (25, 61), (25, 20)]
    def smooth(points, tangent1, tangent2):
        points = np.array(points)
        lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
        curve = CubicSpline(lengths, points, bc_type=((1, tangent1), (1, tangent2)))
        return curve(np.linspace(0, lengths[-1], round(lengths[-1])*2))
    ltan = left[1]-left[0]; ltan /= np.linalg.norm(ltan)
    rtan = right[0]-right[1]; rtan /= np.linalg.norm(rtan)
    top_left = smooth([*upper, left[0]], [0, 1], ltan)
    top_right = smooth([right[0], *end], rtan, [0, -1])
    return np.r_[top_left, left[1:], right[::-1], top_right[1:]], left, right


def figure(s, x, y, scale, view):
    shape, left, right = outline(view)
    pts = shape * scale + (x, y)
    polygon(s, pts, "#E0E6EE", width=3)
    # Broad uninterrupted tone along the whole torso, not localized cups,
    # under-chest shadows or a central depression.
    for i in range(80):
        a, b = i/80, (i+1.02)/80
        t = (a+b)/2
        tone = (5 - 11*(2*t-1)**2 + 2*(.5-t)) if view == "FRONT" else (8 - 20*t*t)
        rgb = np.clip(np.array([224,230,238])+tone,0,255).astype(int)
        color = '#'+''.join(f'{v:02x}' for v in rgb)
        one = left.copy(); two = left.copy()
        one[:, 0] += (right[:, 0]-left[:, 0])*a
        two[:, 0] += (right[:, 0]-left[:, 0])*b
        polygon(s, np.r_[one, two[::-1]] * scale + (x, y), color, stroke=color, width=1)
    polyline(s, pts, "#4C5868", 3)
    # Light clavicle context makes the construction read as a human torso.
    if view == "FRONT":
        for sign in (-1,1):
            s.path([('M',sign*19,80),('C',sign*35,91,sign*58,86,sign*77,89)],
                   '#8F9AA8',2,offset=(x,y),scale=scale)
    elif view == "3/4":
        s.path([('M',-17,79),('C',7,89,38,83,62,88)],'#8F9AA8',2,offset=(x,y),scale=scale)
    if view == "TRUE SIDE":
        # A short context arm, positioned without concealing torso boundaries.
        arm = np.array([(13, 100), (24, 93), (35, 103), (42, 128), (41, 163),
                        (22, 163), (15, 148), (12, 123)])
        polygon(s, arm*scale+(x, y), "#E8EDF3", stroke="#8290A3", width=2)
    # No medial construction line. Sparse lateral surface-flow strokes turn
    # with the same closed sections as the silhouettes.
    for frac in (.25, .76) if view != "TRUE SIDE" else (.65,):
        path = []
        for yy in np.linspace(146, 358, 100):
            cut = section(float(WIDTH(yy)), float(FRONT(yy)), float(REAR(yy)))
            # Selected anterior quadrant samples, with no separate front object.
            idx = int((.25 + .5*frac)*len(cut)) % len(cut)
            u = float(project(cut[idx:idx+1], view)[0])
            path.append((x+u*scale, y+yy*scale))
        polyline(s, path, FLOW, 2)
    for letter, _, yy, *_ in LEVELS:
        row = section(float(WIDTH(yy)), float(FRONT(yy)), float(REAR(yy)))
        u = float(project(row, view).min())
        py = y+yy*scale
        s.text(x-190*scale, py-10, letter, 22, ORANGE, True)
        polyline(s, [(x-169*scale, py), (x+(u-13)*scale, py)], "#A0ADBF", 2, True)
    s.text(x-95*scale, y+446*scale, view, 25, INK, True)
    return {"view": view, "scale_drawing_only": scale, "center_drawing_pixels": [x, y],
            "section_levels_drawing_pixels": {a[0]: y+a[2]*scale for a in LEVELS}}


def save(s, name):
    stream = io.BytesIO(); s.image.save(stream, format="PNG")
    (OUT/(name+".png")).write_bytes(stream.getvalue())
    (OUT/(name+".svg")).write_text("\n".join(s.svg+["</svg>"]))


def reference_card(s, x, y, title, path, box, body, garment, hypothesis, pose, notes):
    s.rect(x, y, 640, 582)
    s.text(x+20, y+17, title, 24, INK, True)
    off, sc = s.artwork(path.name, box, x+20, y+66, 600, 343, source_dir=path.parent)
    for line in garment: s.path(line, BLUE, 3, off, sc)
    for line in body: s.path(line, TEAL, 4, off, sc)
    for line in hypothesis: s.path(line, ORANGE, 3, off, sc, dashed=True)
    for line in pose: s.path(line, "#8594A8", 2, off, sc, dashed=True)
    s.text(x+20, y+427, "C  INTERPOLATED / POSE-ADJUSTED PROPOSAL", 18, ORANGE, True)
    s.lines(x+20, y+466, notes, 19, spacing=29)


def main():
    OUT.mkdir(exist_ok=True)
    rollback = json.loads((OUT/"rollback.json").read_text())
    for p, sha in rollback["production_already_at_pre_test_state"].items():
        assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest() == sha
    s = Sheet(2100, 2270)
    s.text(45, 25, "Emilia | body reconstruction proposal", 43, INK, True)
    s.text(45, 87, "DRAWING REVIEW ONLY. Hidden upper torso and all sections are INTERPOLATED.", 24, ORANGE, True)
    s.text(45, 128, "Filled animation construction drawings. Same section widths/depths determine all three views. No 3D surface exists.", 21, MUTED)
    views = [figure(s, x, 175, 1.32, name) for x, name in ((350, "FRONT"), (1030, "TRUE SIDE"), (1670, "3/4"))]
    s.text(45, 805, "Pale blue = surface flow, never a seam or fold. Short arms / neck / waist show context only.", 22, MUTED)
    s.text(45, 850, "A-E | whole torso cross-sections, common drawing scale", 29, INK, True)
    s.text(45, 894, "BACK above / FRONT below. One continuous perimeter per level. No attached anterior circles or cup outlines.", 21, MUTED)
    section_records = []
    for i, (letter, title, yy, w, f, r) in enumerate(LEVELS):
        x = 55+i*410
        s.rect(x, 940, 390, 290)
        s.text(x+18, 958, letter+"  "+title, 20, INK, True)
        points = section(w, f, r)
        ox, oy, scale = x+195, 1073, 1.28
        polygon(s, points*scale+(ox, oy), "#E2E8F0", stroke="#637589", width=3)
        s.text(ox-27, 1003, "BACK", 15, MUTED)
        s.text(ox-31, 1187, "FRONT", 15, ORANGE, True)
        section_records.append({"level":letter,"role":title,"height_drawing_pixels":yy,
                                "half_width_drawing_pixels":w,"front_depth_drawing_pixels":f,
                                "rear_depth_drawing_pixels":r,"status":"INTERPOLATED_NOT_A_MEASUREMENT",
                                "closed_section_2d_pixels":points.tolist()})
    s.text(45, 1261, "Reference overlays | A visible body   B garment boundary   P pose/camera   C hidden reconstruction", 25, INK, True)
    s.text(45, 1306, "Official pixels stay unchanged. Orange proposals are conceptual pose checks, not calibrated body projections.", 21, MUTED)
    r2 = ROOT/"docs/model-reviews/emilia-arc6-reference-analysis-v2/references"
    r4 = ROOT/"docs/model-reviews/emilia-arc6-v3-s4-cross-validation/references"
    refs = [r2/"emilia_neutral_front.jpeg", r4/"emilia_s4_seated_near_side.jpeg", r4/"emilia_s4_standing_side_oblique.webp"]
    reference_card(s, 45, 1365, "S4 | NEAR FRONT", refs[0], (423,188,625,423),
        [[("M",568,351),("C",570,370,578,394,591,416)]],
        [[("M",500,228),("C",485,242,489,255,498,262)],[("M",507,264),("C",506,281,510,297,521,301),("C",519,316,533,324,549,324)]],
        [[("M",465,222),("C",460,240,451,263,452,283),("C",452,307,460,329,462,349)],
         [("M",554,226),("C",568,241,581,262,582,281),("C",583,306,574,328,568,351)]], [],
        ["A: lower purple side is directly visible.", "B: white opening and hems are garment edges.", "C: covered upper volume stays hypothetical."])
    reference_card(s, 730, 1365, "S4 | SEATED NEAR SIDE", refs[1], (330,198,445,330), [],
        [[("M",356,216),("C",350,228,352,236,363,241),("C",374,247,365,247,367,255),("C",367,266,376,269,386,270)]],
        [[("M",360,209),("C",359,221,350,236,352,250),("C",354,273,369,294,390,311)],
         [("M",395,210),("C",401,231,413,261,421,301)]],
        [[("M",394,310),("L",380,213)]],
        ["A: no free upper-chest silhouette to trace.", "P: sitting, bracing and camera affect contour.", "C: front/rear depth remains interpolation."])
    reference_card(s, 1415, 1365, "S4 | STANDING OBLIQUE", refs[2], (220,190,328,325),
        [[("M",248,295),("C",248,305,239,313,232,319)],[("M",303,289),("C",301,300,299,311,299,323)]],
        [[("M",242,286),("C",249,300,263,293,274,285),("C",282,294,290,286,295,282)],
         [("M",247,235),("C",267,246,289,249,300,245)]],
        [[("M",271,216),("C",284,235,303,251,302,269),("C",301,289,294,303,293,321)],
         [("M",242,215),("C",238,242,240,273,248,295)]],
        [[("M",254,319),("L",273,211)]],
        ["A: exposed purple sides below the hem.", "B: sleeve/hem obscure the return.", "P/C: oblique arms hide the upper wrap."])
    s1 = ROOT/"docs/model-reviews/emilia-arc6-reference-analysis-v3/references/emilia_s1_neutral_turnaround.jpeg"
    s.rect(45, 1980, 2010, 238)
    s.text(70, 2000, "S1 neutral front / side | SECONDARY STRUCTURE ONLY", 25, INK, True)
    s.artwork(s1.name, (282,96,360,194), 85, 2045, 135, 150, source_dir=s1.parent)
    s.artwork(s1.name, (96,87,176,200), 275, 2045, 135, 150, source_dir=s1.parent)
    s.lines(475, 2050, ["Upright posture supports structural reasoning. Cups and fitted bodice still hide the body.",
                       "No S1 costume edge or total neutral depth becomes a body measurement.",
                       "Anterior/medial shape and posterior limits stay C. S4 has priority where sources disagree.",
                       "No mesh edit, GLB build, garment edit or new geometry test. Stop for drawing review."], 21, spacing=37)
    save(s, "emilia-body-reconstruction")
    sources = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*refs,s1]}
    record = {"status":"UNAPPROVED_2D_RECONSTRUCTION_PROPOSAL","basis":"official S4 first, official S1 secondary",
              "drawing_method":"filled vector animation construction figures; five manually designed complete 2D sections",
              "coordinates":"drawing pixels only, no physical/official body scale or measurements",
              "consistency_method":"same whole section contours determine front width, true-side depth and 40-degree drawing-plane support",
              "consistency_limit":"paper-view agreement is conceptual and does not prove a correct 3D anatomical surface",
              "sections":section_records,"views":views,"reference_sha256":sources,
              "hidden_regions":"upper onset, anterior depth, medial distribution and most posterior limits are interpolated",
              "overlay_limit":"hand pose-adjusted 2D hypotheses; source frames are not orthographic blueprints",
              "v3_guide_used_as_target":False,"failed_test_mesh_or_render_used_as_shape_reference":False,
              "new_meshes":0,"mesh_edits":0,"glb_builds":0,"garment_edits":0,"new_geometry_tests":0,
              "next_action":"STOP FOR USER DRAWING REVIEW"}
    (OUT/"reconstruction.json").write_text(json.dumps(record,indent=2)+"\n")
    print(json.dumps({"sheet":"emilia-body-reconstruction.png","drawing_views":3,"whole_torso_sections":5,"mesh_edits":0,"glb_builds":0}),flush=True)


if __name__ == "__main__":
    main()

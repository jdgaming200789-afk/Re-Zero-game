# Emilia V3 first geometry test

Completed experiment. Overall verdict: **MAJOR DEVIATION, unapproved**.
Stopped after diagnostics. No garment fitting or second geometry iteration.

Rollback commit: `b6ccdda`, made before any model build or vertex change.
Its parent is `74c46b82da4445b059b18bb32eb809c1700cb52a` on the existing
`codex/emilia-arc6-contour-refit` branch. No restart or old geometry replacement.

The existing character source and game GLB remain byte-identical to rollback.
The first geometry test is an isolated candidate in `body-v3-test.glb`.
`body-before-v3.glb` is the current complete body before this patch, used only
for regression comparison. Neither historical render nor hidden costume depth
supplies an anatomical target.

## Method and locks

The current upper torso is a regular contour grid joined to preserved shoulder
and arm loops. It used transverse depth landmarks with greater off-center
depth, creating lower medial pockets. The test fits one continuous loft of
convex quintic quadrant curves, joined as periodic C2 sections. FRONT width,
SIDE excursion, and 40-degree support constrain the same cross sections.

V3 is schematic and has no anatomical units. Its registration was fixed before
movement: guide y=55 to z/H=0.812 and y=311 to z/H=0.675, with a common lateral
scale anchored to the locked lower ribcage. SIDE excursion is relative to its
endpoint line, not to the schematic rear line, S1 cup rim or S4 white cloth.
The frozen file and every guide path remain unchanged. Registration and full
section constraints are recorded in `geometry-test.json`.

Only 10,144 existing central torso vertices changed, in x/y. No z coordinate,
mesh face connectivity, vertex count or face count changed. All 16,700
protected body vertices are exact, including arm bridges and all retained
regions. Existing head and elf ears were copied as immutable context from the
current asset. No shoulders, neck, arms, abdomen, waist, pelvis, hips, thighs,
legs, head, hair, cape, ornaments or garments were rebuilt or modified.

The current body was constructed once. There were zero garment builds. Both
test exports were saved before rendering. Rendering imports the finished GLB
and never calls a modeling builder.

## Guide comparison and failure inspection

| Region | Verdict | Finding |
| --- | --- | --- |
| FRONT | MAJOR DEVIATION | Locked outer graft restricts fullness; broad flat central band remains. |
| 3/4 | MAJOR DEVIATION | Upper planar turn, lower band and armpit pinch interrupt the wrap. |
| SIDE positions | SMALL DEVIATION | Registered crest and center return track V3; this does not approve curvature. |
| Connected surface / topology | MATCHES GUIDE | One body, no added anterior pieces; zero topology changes or detected body intersections. |

The test does not recreate ellipsoid objects, but its front still reads as one
broad mass. The old paired upper centers are reduced, while lower paired
pockets persist. Front and low-front expose a shelf/band, broad flattening and
a lower medial indentation. True side exposes a concentrated upper turn and
a separate lower return bend. The locked arm junction retains visible pinching.
Smooth-lit 3/4 confirms these are surface-reading problems, not hidden garment
effects. No surface intersections, nonmanifold edges or degenerate faces were
found in either complete body audit.

The fit reaches its transverse shape bound in part of the chest. Its limited
section family then flattens the center; graft masks restrict its outer turn
and retain lower off-center depth. Height shape clamping also limits a global
C2 continuity claim. A side-outline match alone did not solve the surface.
No incremental repair was attempted after inspection.

## Renders and reproducibility

`emilia-v3-guide-test.png` / `.svg`: unchanged FRONT, 3/4 and SIDE hypotheses
beside their test renders. The 3/4 schematic's original orientation is retained;
the fixed render faces the other way. No guide is redrawn to agree with the mesh.

`emilia-v3-seven-views.png` / `.svg`: front, 40-degree oblique, true side, low
front, full front, full side, and smooth-lit oblique. `renders/` holds native
600x720 PNGs and individual camera / source records. `before-renders/` uses
identical cameras, pose and lights for current-baseline comparison only.

The six camera definitions are imported unchanged from `review_emilia.py`.
Arms remain in the current uncut rest pose. Unlike the old dressed renderer,
there is no temporary 58-degree arm sweep. Both baseline and candidate use
this same rest pose; limbs stay visible and unchanged.

`review-report.json` gives every failure-mode finding, actual exported central
loft cross-section residuals, and render timings. `vertex-lock.npz` supplies
before/after coordinates, provenance and patch weights. `rollback-lock.json`
and the final preservation report prove original files and guides are unchanged.

The cached interpreter was missing. Restoring Python 3.11.16 reused the existing
bpy 4.2.0 installation. Every camera then completed, with a 75-second external
timeout and separate verbose log. No view stalled; no rendering workaround
changed geometry. The bpy worker exits after successful saves, avoiding its
previous native teardown problem.

Example build, invoked once for this test:

```bash
timeout --kill-after=5s 180s tools/blender/.cache/venv/bin/python -u \
  tools/blender/run_bpy_script.py tools/blender/test_emilia_v3.py \
  --out docs/model-reviews/emilia-arc6-v3-first-geometry-test
```

Example isolated render, no rebuild:

```bash
timeout --kill-after=5s 75s tools/blender/.cache/venv/bin/python -u \
  tools/blender/run_bpy_script.py tools/blender/render_emilia_v3_test.py \
  --glb docs/model-reviews/emilia-arc6-v3-first-geometry-test/body-v3-test.glb \
  --out docs/model-reviews/emilia-arc6-v3-first-geometry-test/renders \
  --view front
```

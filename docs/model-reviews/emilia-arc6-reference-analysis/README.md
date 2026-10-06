# Emilia: artwork analysis before another body fit

**V1 guides were not approved.** The user identified the rectangular front
and overly distinct side return. The revised guide and six-frame evidence
check are in `../emilia-arc6-reference-analysis-v2/`. This first sheet is
preserved as review history, not an anatomical target.

**Geometry work is paused for review of these guides.** The last anterior
refit is rejected and archived. The body source and restored body-only GLB
match the immediately preceding body revision; `rollback.json` records the
byte comparisons. No GLB build, render, or new deformation was performed for
this analysis. Existing review tooling and completed outputs are preserved.

`emilia-reference-analysis.png` and the standalone SVG contain three cropped
official references with hand-entered annotations in source-image pixels.
Green identifies directly visible body/bodysuit information. Blue follows
white cloth edges. Translucent amber marks selected areas hiding the body;
these patches do not claim a concealed anatomical boundary. The opening
close-up has exposed purple surface but no independent outer body contour.

The front white silhouette is a garment outline. The running image supplies
supporting evidence with pose, lean, perspective and cloth confounds. Neither
image supplies measured hidden chest depth. No independent true-side,
orthographic three-quarter, or unclothed torso scan was supplied. No old
Claude/Devin render or failed model pass informs the guide drawings.

The lower row contains tentative two-dimensional front, three-quarter and
side curves. They have no physical scale, mesh coordinates, numeric target
dimensions or asserted correspondence to a hidden body contour. The front
proposal shows a restrained outer turn and lower return. The oblique proposal
shows one ribcage surface turning toward the near side. The side proposal
separates an upper onset, projection region and lower return. Thin interior
lines indicate surface flow, not seams, grooves or independent objects.
Amber bands are qualitative uncertainty, not statistical confidence bounds.

These are proposals for review, not an approved surface. After review, a fit
would use the approved curves as constraints on one continuous surface with
compatible tangents and curvature at the ribcage/armpit joins. Hidden regions
must remain interpolation rather than measurements taken from white cloth.
The preserved shoulder boundary, waist, abdomen, pelvis, hips, thighs, arms
and neck receive no new targets during this stage. Body and garment fitting
must remain paused until the user reviews the guide interpretation.

The pure Pillow/SVG script `tools/blender/analyze_emilia_references.py` reads
only the three official image files. It never imports Blender or model code,
reads model renders, or writes geometry. `reference-analysis.json` preserves
source hashes, the manual paths and the proposed diagram curves.

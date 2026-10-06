# Rejected Emilia body pass: historical archive

**Stopped and rolled back at the user's direction.** The pass below is a
regression, not a candidate base for further deformation. The front and
three-quarter views flatten the center and retain outer volume; the side
profile becomes a blunt bulge. Its clothed-reference interpretation does not
establish the underlying body contour. The original renders and the report
below are preserved only as a record of the rejected work.

The active body code is restored byte for byte to the immediately preceding
revision. `../emilia-arc6-reference-analysis/rollback.json` records the source
and unchanged asset hashes. The separate restored GLB is copied from that
preceding body checkpoint; no rebuilding or new shaping was done. The
rejected anterior solver is archived in `rejected-source/` and is no longer
called by the model. Review/render tools remain available.

The next deliverable is an artwork-only analysis and proposed guide sheet.
Body work must wait for review of those guides. The original report follows;
its shape inferences are superseded by this rejection.

---

# Original report: body-only projected-contour checkpoint

This is an **unapproved body review checkpoint**, continuing the working
surface at `944c4e270fa6c85e903e5a9c4a89797d7706a0c1` on
`codex/emilia-arc6-contour-refit`. The model was not restarted. The preceding
body GLB and six completed PNGs were copied unchanged into `before/` before
modeling; `baseline.json` records their hashes. Their purpose is comparison
and rollback, not visual design reference.

The supplied no-cloak front, running side and opening-close-up art in
`references/` are the visual sources. The front and running views are clothed;
the running image is posed and partly cloaked. No independent orthographic
3/4 or low-front art was supplied. Body depths and oblique extents are
approximate inferences, not measured nude anatomical dimensions. The white
garment's hanging hem is excluded from the inferred body outline.

## Geometry method

The existing upper quad topology, shoulder-window fairing and bridges to
the arms remain in place. A new anterior surface is driven by independent
height curves for front half-width, actual true-side maximum depth, medial
depth, and the 40-degree projected extent. The side maximum is a real
maximum of each bounded transverse curve; it is no longer merely a depth
sample at 30 degrees that a cubic may overshoot.

Quintic transverse curves share position, tangent and curvature at their
joins. Their outer landmark is solved from the independent oblique support
contour. Their crest angle moves with height as the medial and side contours
converge toward the ribcage. Holding that angle constant had produced a flat
strip across lower sections. No ellipsoid chest volumes were added or tuned.

A constrained minimum-curvature solve sews the resulting surface to the
preserved body. It minimizes curvature of the final surface itself. Penalizing
only displacement had carried some old band curvature into the new join.
All non-grid shoulder bridges and grid points in the shoulder-window core
remain outside the refit. Vertices are changed only in X/Y; waist, pelvis,
legs, outer arms and upper neck are outside the patch.

The front outline tapers through the lower chest toward the retained ribcage.
The inferred side target begins projecting below the clavicular region near
`.796H`, reaches its fullest depth around `.744H`, and returns into the lower
ribcage through `.696H` toward the preserved boundary at `.670H`. These
positions reconcile the clothed front and posed running art; they are not
percentage changes to the previous model. The 40-degree view checks whether
those independent curves form a consistent surface.

## Review and remaining issue

`after/body/` contains the exported GLB's six actual render PNGs:
front, 40-degree 3/4, true side, low front, full front and full side.
All cameras, arm sweep, lighting, samples and projection match `before/`.
The source GLB is `emilia-body-only.glb`; its SHA-256 is
`e9d742c7f3737cf50dd5307aa861a9ea01d0e018fe93bcf0a5af4e595fbb413a`.

`comparisons/` places the supplied art beside every relevant view and contains
an exact-camera before/after sheet. The body-only surface remains unapproved:
the lower-chest shading band is softer, but it is still visible in front and
low-front. The lower and medial return need further assessment before garment
fitting. This package does not claim that the body is finished.

Five completed iterative review sheets are kept in `iterations/` as historical
outputs. Their full GLBs, PNGs, logs, raw audits and the selected checkpoint
were also saved in the separate downloadable iteration archive. None of the
historical iterations is a visual design reference.

The experimental pointed white panels were rolled back in code. The game GLB
restores only the prior panel mesh while retaining all other mesh buffers from
the current `944c4e2` checkpoint; see `panel-rollback.json`. The new body-only
candidate is delivered separately for review. No garment refit was performed.

## Validation

The raw complete body has 26,972 vertices and 27,258 faces. The audit found
zero boundary/nonmanifold edges, degenerate faces, nonfinite vertices, and
transverse nonadjacent-triangle crossings. The export has finite accessors,
valid indices/joints, normalized skin weights, and no chest-panel node. The
cape and both hood parts retain their frozen buffers and transforms.

`preservation.json` reports coordinate matching against the preceding body.
All 7,225 waist/lower-body coordinates and 4,812 outer-arm coordinates are
identical. The head POSITION buffers are identical. Rebuilding the unchanged
shoulder fairing gives at most 1.32 micrometers of float32 coordinate drift;
the refit excludes those graft points. This numerical drift is reported.
All six camera records and the arm sweep match exactly.

## Reproduce one body checkpoint

Python 3.11 and `tools/blender/requirements-emilia.txt` provide the tested
headless runtime. SciPy supplies the sparse surface solve. Build only Emilia,
then review that GLB separately, with timeouts:

```bash
EMILIA_BODY_ONLY=1 CHAR_OUT_DIR=test-results/emilia-body-contours/body \
timeout --signal=TERM --kill-after=5s 180s \
  tools/blender/.cache/venv/bin/python -u tools/blender/run_bpy_script.py \
  tools/blender/build_characters.py emilia

timeout --signal=TERM --kill-after=5s 90s \
  tools/blender/.cache/venv/bin/python -u tools/blender/run_bpy_script.py \
  tools/blender/review_emilia.py \
  --glb test-results/emilia-body-contours/body/emilia.glb \
  --out test-results/emilia-body-contours/review --clay
```

The normal six-camera review completed with exit status 0. No GLB import or
camera hung. An intermediate build was rejected by the transverse-curve
bound check before export; its outer tangent was corrected to stay inside
the endpoint support bounds. The safe worker still avoids the bpy wheel's
known native-finalization crash after successful script completion. The
verbose selected-build, audit and render logs are included here.

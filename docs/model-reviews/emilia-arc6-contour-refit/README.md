# Emilia Arc 6: contour and cloth review

Base: `c97eceef3b469d9c2bf650ed62f1e5b3679874ab` on
`claude/rezero-pleiades-foundation-rtkk6t`. Work branch:
`codex/emilia-arc6-contour-refit`. No later model code or comparison renders
were used. Baseline images were rebuilt from this exact commit.

## Reference observations

The three supplied images are the design evidence. Measurements below are
approximate image-space landmarks, not body measurements from a hidden 3D
model. Cloth and the running pose obscure some anatomy. In particular, the
three-quarter body contour is inferred by reconciling the front and running
side views. It is not presented as an independently photographed contour.

| Supplied image | Observation used for shaping |
| --- | --- |
| `IMG_1592.jpeg`, 554 x 554, no-cloak front | White panel envelope near chest height is approximately x=207..344. Waist near y=400 is approximately x=219..331. This puts the cloth envelope at roughly 1.2 times the waist width. The panels descend into broad scallops, and the waist continues smoothly into the visible pelvis. |
| `IMG_1693.jpeg`, 910 x 1024, running side | The upper front slopes into the supported chest, then returns smoothly to the ribs. The visible abdomen is restrained. The white edges hang away from the lower torso while the upper/outer attachments support the cloth. The cape hides the exact upper-body root and must not determine the uncloaked panel outline. |
| `IMG_1694.jpeg`, 495 x 232, opening close-up | The purple opening is the space between curved cloth edges. Its sides change direction gently and differ slightly. No stiff vertical slot, thick piping, added cup, or sharply cut arch is required. |

The body target uses one smooth transverse contour at every height: a wider
upper torso flowing into the ribs, a shallow central change in depth, and a
restrained abdomen. Front width, anterior depth, and oblique fullness must be
checked together. The lower body is kept from the Claude base unless the
attached evidence clearly calls for a change.

## Baseline construction

`humanoid.py` constructs the shared body with Skin and Subdivision modifiers,
then refines the torso and front chest. Emilia requests two ellipsoidal wraps
(`_breast_wrap`), Gaussian torso sculpting, and two different Taubin smoothing
passes. The wrap displaces vertices in X, Y, and Z. It produces a deep center
cleft, a concentrated lower pole, and a sharp lower return on this base.

`emilia_arc6.py` maps an outline onto an unrolled cylindrical radius field.
It adds hover, lower lift, edge puff, solidification, and tubular borders.
This repeats the body lobes and makes the lower border read as a thick rim.
`build.py` deletes covered body faces after fitting and consolidates garment
parts. The ordinary browser model sheet uses perspective cameras and idle
poses, so it is insufficient for exact proportion comparisons.

## Reproducible checkpoints

`tools/blender/review_emilia.py` imports the exported GLB and uses six fixed
orthographic cameras: true front, 40-degree front three-quarter, true side,
low front, full front, and full side. It hides hair, cloak, hoods, and hair
ornaments only for review. It sweeps both arms behind the torso to expose the
side profile. Body-only and garment GLBs use identical cameras and lighting.
Individual PNGs and `cameras.json` are generated under `test-results/`.
Contact sheets preserve the image aspect ratio.

```bash
EMILIA_BODY_ONLY=1 CHAR_OUT_DIR=test-results/emilia/body \
  node tools/blender/run-blender.mjs characters emilia
CHAR_OUT_DIR=test-results/emilia/garment \
  node tools/blender/run-blender.mjs characters emilia
python tools/blender/review_emilia.py \
  --glb test-results/emilia/body/emilia.glb \
  --out test-results/emilia/body --clay
python tools/blender/review_emilia.py \
  --glb test-results/emilia/garment/emilia.glb \
  --out test-results/emilia/garment
```

The checked-in `00-baseline-body.jpg` and `00-baseline-garment.jpg` document
the starting shape. They are diagnostics, not visual design references.

## Continuous body checkpoint

Emilia now opts into `TorsoContours` in `torso_contours.py`. Eleven section
landmarks constrain width, front depth, posterior depth, and broad anterior
spread. Natural cubic interpolation gives continuous longitudinal curvature.
Each transverse section is one closed smooth curve: an elliptical ribcage
plus a broad anterior extension whose first two derivatives vanish at the
sides. The two forward peaks share a shallow central surface. No breast
ellipsoid, radial smooth maximum, or legacy spherical bump runs for Emilia.

The Skin graph now has an upper-rib row below the arm branch. This prevents
its long chest-to-branch edge from pinching the ribcage into the armpit.
Closed trunk sections supply polar coordinates. Above them, a positive
transverse scale and monotone anterior transport preserve the branching
shoulder web; projecting both arm walls onto a single radial section caused
folds and was rejected. Quintic blending connects both methods without
moving vertex heights. Other characters retain their existing shaping path.

The Gaussian belly, under-rib indentation, and iliac bumps are removed. The
existing hip/thigh radius settings and lumbar curve stay. The navel becomes a
small local dimple applied after fitting. Shared surface normals survive
covered-face deletion and the skin/suit material split, preventing a color
boundary from looking like a seam in the body.

`01-contour-body.jpg` and `emilia-body-only.glb` record the corrected body.
The uncut audit has 15,692 vertices and 15,504 faces, no nonmanifold or boundary
edges, no degenerate faces, and no nonfinite vertices. The extra upper-rib
row changes sampling in the torso, not the leg graph or lower-body settings.
Below z=0.52H, both meshes retain 1,989 vertices; bidirectional nearest-vertex
displacement is at most 0.122 mm. Pelvis width at z=0.55H changes by 0.32 mm,
while its anterior depth decreases by 2.96 mm as abdominal sculpting is
removed. No belly volume is added. `body-geometry.json` contains front,
oblique, and side ray samples in H units.

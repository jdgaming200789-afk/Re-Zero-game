# Emilia Geometry Test 2

Rollback checkpoint before Test 2 geometry edits. Test 1 FRONT, 3/4 and SIDE
are MAJOR DEVIATION. Curvature FAILED. Original Test 1 files stay preserved;
`review-correction.json` supersedes its old side verdict.

`test1-diagnosis.json` records the construction audit, including the complete
601-sample side silhouette. The broad transverse template hit its bound across
17 of 81 sections. Literal side-stroke fitting and the template/mask method
failed to control the continuous surface.

V3 remains a conceptual transition hypothesis. Its magenta drawing is not a
literal geometry target. S4 remains authoritative, with S1 secondary structure
only. No old model render supplies anatomical targets. No garment work.

Test 2 reused `body-before-v3.glb`, the saved pre-Test-1 body. No character
generator or garment builder ran. `body-test2.glb` is an isolated experiment,
not the game's character asset. Test 1 and all earlier completed outputs stay
intact.

The new method replaces the bounded transverse templates and displacement
masks with a coupled final-surface bending solve. A fifth-degree side spline
controls the whole onset / fullest arc / return. It has fixed boundary value,
tangent and curvature, and monotone derivative constraints across 1,202
samples. Transverse rows are monotone and convex inside the free patch.
Neither subdivision nor extra spherical/ellipsoidal volumes were used.

The former Test 1 maximum projection and its height were held as unapproved
experimental controls. They are not official proportions or evidence that
Test 1 was close. This isolates curvature distribution, and does not establish
a correct magnitude. V3's drawing was not registered or fitted numerically.

4,579 y coordinates changed in the existing upper-torso patch. All x/z
coordinates and 22,393 protected body positions are exact. Topology, existing
head context, all other accessors and 107 locked files are unchanged.

All seven PNGs were rendered from the finished GLB by the unchanged renderer,
one timed process per view. Each had a 75-second timeout and completed normally.
The six proportion cameras and the smooth-lit 3/4 camera match Test 1 exactly.
No previous image or GLB was silently regenerated.

Result: FRONT = MAJOR DEVIATION, 3/4 = MAJOR DEVIATION,
SIDE = MAJOR DEVIATION, CURVATURE = FAILED.
The rounder crest and smoother transverse turn do not establish a pass.
The front / low-front band and bowl-like shading persist. The side still has
a sloped onset, concentrated projection and overly direct lower return.
Locked armpit pinching remains. The complete-body triangle audit found zero
transverse intersections, open/nonmanifold edges or degenerate faces.

`review-test2.json` records the whole-curve review and all failure modes.
`emilia-test2-frozen-guide.png` shows the original frozen guide beside the
three main cameras, with conceptual rather than pixel-alignment verdicts.
`emilia-test2-seven-views.png` shows all seven completed diagnostic cameras.
`emilia-test2-regression.png` compares corresponding Test 1/Test 2 images only
as regression evidence.
`emilia-test2-complete-curves.png` plots raw exported silhouettes and their
tangent / curvature measurements across the whole span, not just landmarks.
Both tests use the same 0.00514 H local derivative measurement window to
remove mesh-triangle frequency noise. No mesh was smoothed by this analysis.

Numerical preflight logs are preserved. The rejected two-span polynomial and
the poorly conditioned spline attempt wrote no GLB. The final solve wrote one
GLB before rendering. No mesh edits followed render inspection.

STOP FOR REVIEW. No garment fitting or further geometry iteration is included.

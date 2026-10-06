# Proportion review diagnostic, 2026-10-06

Branch: codex/emilia-arc6-contour-refit. HEAD: 279324b.
No geometry edits, GLB rebuilds, or complete review-suite reruns were performed.

The final garment GLB already exists at public/assets/models/characters/emilia.glb,
4,508,076 bytes, SHA-256:
90dc0470fe00633493da3feef8ec98d2fff897049fe9c097a543451f55a2fde4.
It matches the saved stage-17 garment GLB. All six body and six panel PNGs
in docs/model-reviews/emilia-arc6-contour-refit/views verify successfully.
No stale Blender or modeling/review Python process was found in this session.
Previous temporary logs are absent, so the original stuck UI status cannot
be attributed conclusively to a particular previous process or camera.

The first new attempt could not start: the preserved venv referenced a missing
Python 3.11 interpreter. Restoring only that interpreter with uv python install
3.11 repaired startup. See interpreter-restore.log.

The isolated ordinary front command imported the GLB, completed all 12 Cycles
samples, and saved front.png, cameras.json, sheet.jpg, and source.json in direct/.
The render took 2.95 seconds. The process then segfaulted with exit status 139
during native bpy process finalization. It did not hit the 90-second timeout.
See direct-render.log. No camera or GLB-load hang was reproduced.

The same script and front camera run through a worker that flushes output and
uses os._exit(0) after successful script completion exited with status 0.
The render took 3.21 seconds. See safe-render.log and safe/.
The new front PNG has identical RGB pixels to the saved final front PNG;
its camera record is identical. Encoded PNG bytes differ. The GLB is unchanged.

From the repository root, a bounded isolated future review can use:

```bash
timeout --signal=TERM --kill-after=5s 90s \
  tools/blender/.cache/venv/bin/python -u \
  test-results/emilia-contour-refit/stall-diagnostic/review-worker.py \
  --glb public/assets/models/characters/emilia.glb \
  --out test-results/emilia-contour-refit/stall-diagnostic/next-front \
  --views front
```

This worker makes no modeling or rendering changes. Exceptions before normal
completion still fail the process. The external timeout bounds a stalled worker.

The subsequent contour-mesh and panel checkpoints used tools/blender/run_bpy_script.py with 90-second render and 240-second build timeouts. All six body and all six panel cameras completed with status 0. No camera or GLB import stalled.

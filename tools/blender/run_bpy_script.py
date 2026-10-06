"""Run a standalone Blender Python script without unsafe native teardown.

The installed bpy wheel can crash while Python finalizes after saving all
outputs. This worker bypasses teardown only after the script returns normally.
Use an external timeout to bound builds or renders; exceptions still fail.

    timeout --kill-after=5s 90s python -u tools/blender/run_bpy_script.py \
        tools/blender/review_emilia.py --glb path/emilia.glb --out path/review
"""
from __future__ import annotations

import faulthandler
import os
import runpy
import sys


if __name__ == "__main__":
    faulthandler.enable()
    if len(sys.argv) < 2:
        raise SystemExit("Usage: run_bpy_script.py script.py [script arguments]")
    script = sys.argv[1]
    sys.argv = sys.argv[1:]
    print(f"[worker] start {script}", flush=True)
    runpy.run_path(script, run_name="__main__")
    print("[worker] script complete", flush=True)
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)

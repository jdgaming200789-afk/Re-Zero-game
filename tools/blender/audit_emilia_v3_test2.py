"""Read-only validation of the finished isolated body GLB. No model build."""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import bpy

from audit_emilia import topology, surface_crossings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    path, out = Path(args.glb).resolve(), Path(args.out).resolve()
    start = time.monotonic()
    print("LOAD finished GLB for audit only", flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    body = next(o for o in bpy.data.objects if o.name == "emilia_v3_test_body")
    report = {"source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
              "body": topology(body), "surface_crossings": surface_crossings(body),
              "character_rebuilds": 0, "garment_rebuilds": 0,
              "elapsed_seconds": time.monotonic() - start}
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()

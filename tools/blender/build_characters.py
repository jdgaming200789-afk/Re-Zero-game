"""Builds character GLBs → public/assets/models/characters/<id>.glb

Run:  node tools/blender/run-blender.mjs characters [id ...]
"""
from __future__ import annotations

import os
import sys

import bpy  # noqa: F401  (initialises bmesh/mathutils for the character modules)

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "characters"))
sys.path.insert(0, HERE)

from build import build  # noqa: E402
from roster import ROSTER  # noqa: E402


def main(argv: list[str]) -> None:
    ids = [a for a in argv if not a.startswith("-")] or list(ROSTER)
    for cid in ids:
        if cid not in ROSTER:
            print(f"unknown character {cid}; known: {', '.join(ROSTER)}")
            continue
        build(ROSTER[cid]())


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    main(args)

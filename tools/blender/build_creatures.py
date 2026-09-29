"""Builds creature GLBs → public/assets/models/creatures/<id>.glb

Run:  node tools/blender/run-blender.mjs creatures [id ...]
"""
from __future__ import annotations

import os
import sys

import bpy  # noqa: F401  (initialises bmesh/mathutils for the creature modules)

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "creatures"))
sys.path.insert(0, os.path.join(HERE, "characters"))
sys.path.insert(0, HERE)

from creature import build  # noqa: E402
from bestiary import BESTIARY  # noqa: E402


def main(argv: list[str]) -> None:
    ids = [a for a in argv if not a.startswith("-")] or list(BESTIARY)
    for cid in ids:
        if cid not in BESTIARY:
            print(f"unknown creature {cid}; known: {', '.join(BESTIARY)}")
            continue
        build(BESTIARY[cid]())


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    main(args)

"""Validate Emilia's final GLB and byte identity of excluded Claude parts.

This checks the delivered buffers/skins, rather than trusting export logs.
Run: python tools/blender/validate_emilia_export.py --glb path/emilia.glb
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / "characters"))
from gltf_parts import read_glb

DTYPES = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
PARTS = ("emilia_part_cloak", "emilia_part_hooddown", "emilia_part_hoodup")


def values(doc, raw, index):
    a = doc["accessors"][index]
    view = doc["bufferViews"][a["bufferView"]]
    dtype = np.dtype(DTYPES[a["componentType"]])
    width = WIDTHS[a["type"]]
    return np.ndarray((a["count"], width), dtype=dtype, buffer=raw,
                      offset=view.get("byteOffset", 0) + a.get("byteOffset", 0),
                      strides=(view.get("byteStride", dtype.itemsize * width), dtype.itemsize))


def validate(glb, baseline, body_only=False):
    doc, raw = read_glb(glb)
    source, source_raw = read_glb(baseline)
    assert source["asset"]["extras"]["frozen_parts_origin"] == "c97eceef3b469d9c2bf650ed62f1e5b3679874ab"
    for i in range(len(doc["accessors"])):
        assert np.isfinite(values(doc, raw, i)).all(), f"Nonfinite accessor {i}"
    triangles, skinned = 0, 0
    max_weight_error = 0.0
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        for p in doc["meshes"][node["mesh"]]["primitives"]:
            attrs = p["attributes"]
            count = len(values(doc, raw, attrs["POSITION"]))
            assert all(len(values(doc, raw, i)) == count for i in attrs.values())
            if "indices" in p:
                indices = values(doc, raw, p["indices"])
                assert indices.max() < count
                assert len(indices) % 3 == 0
                triangles += len(indices) // 3
            if "skin" in node:
                skin = doc["skins"][node["skin"]]
                assert values(doc, raw, attrs["JOINTS_0"]).max() < len(skin["joints"])
                weights = values(doc, raw, attrs["WEIGHTS_0"])
                assert weights.min() >= 0
                error = float(np.abs(weights.sum(axis=1) - 1).max())
                max_weight_error = max(max_weight_error, error)
                assert error < 2e-5
                skinned += 1
    retained = []
    nodes = {n.get("name"): n for n in doc["nodes"]}
    source_nodes = {n.get("name"): n for n in source["nodes"]}
    for name in PARTS:
        n, s = nodes[name], source_nodes[name]
        new_mesh, old_mesh = doc["meshes"][n["mesh"]], source["meshes"][s["mesh"]]
        assert len(new_mesh["primitives"]) == len(old_mesh["primitives"])
        for new, old in zip(new_mesh["primitives"], old_mesh["primitives"]):
            assert new["attributes"].keys() == old["attributes"].keys()
            for k in new["attributes"]:
                assert values(doc, raw, new["attributes"][k]).tobytes() == values(source, source_raw, old["attributes"][k]).tobytes(), (name, k)
            assert values(doc, raw, new["indices"]).tobytes() == values(source, source_raw, old["indices"]).tobytes()
            assert doc["materials"][new["material"]] == source["materials"][old["material"]]
        for key in ("matrix", "translation", "rotation", "scale"):
            assert n.get(key) == s.get(key), (name, key)
        skin, old_skin = doc["skins"][n["skin"]], source["skins"][s["skin"]]
        assert [doc["nodes"][i]["name"] for i in skin["joints"]] == [source["nodes"][i]["name"] for i in old_skin["joints"]]
        assert values(doc, raw, skin["inverseBindMatrices"]).tobytes() == values(source, source_raw, old_skin["inverseBindMatrices"]).tobytes()
        for i, old_i in zip(skin["joints"], old_skin["joints"]):
            if source["nodes"][old_i]["name"].startswith("cape"):
                for key in ("matrix", "translation", "rotation", "scale"):
                    assert doc["nodes"][i].get(key) == source["nodes"][old_i].get(key)
        retained.append(name)
    if body_only:
        assert "emilia_chest" not in nodes, "Body-only review includes chest panels"
        cloth_report = {"body_only": True, "panel_count": 0}
    else:
        cloth = nodes["emilia_chest"]
        assert cloth["extras"]["panel_count"] == 2
        assert 0.001 < cloth["extras"]["cloth_thickness_m"] < 0.002
        cloth_report = {"panel_count": 2, "cloth_thickness_m": cloth["extras"]["cloth_thickness_m"]}
    return {"glb": str(glb), "sha256": hashlib.sha256(Path(glb).read_bytes()).hexdigest(),
            "triangles": triangles, "skinned_primitives": skinned,
            "max_weight_sum_error": max_weight_error, "retained_parts_identical": retained,
            **cloth_report}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--baseline", default=str(Path(__file__).resolve().parent / "characters/frozen/emilia_cloak_c97eceef.glb"))
    parser.add_argument("--out")
    parser.add_argument("--body-only", action="store_true")
    args = parser.parse_args()
    report = validate(args.glb, args.baseline, args.body_only)
    encoded = json.dumps(report, indent=2) + "\n"
    if args.out:
        Path(args.out).write_text(encoded)
    print(encoded)

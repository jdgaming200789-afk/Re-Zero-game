"""Keep excluded GLB parts byte-for-byte from a known baseline asset.

Procedural draping samples the body, so rebuilding a corrected body can also
change a cloak even when none of its modeling code changes. This utility
retains the named baseline meshes after export and removes unused buffers.
It never supplies body geometry or design targets to the modeling pipeline.
"""
from __future__ import annotations

import argparse
import copy
import json
import struct
from pathlib import Path


def read_glb(path):
    raw = Path(path).read_bytes()
    magic, version, size = struct.unpack_from("<III", raw)
    if magic != 0x46546C67 or version != 2 or size != len(raw):
        raise ValueError(f"Invalid GLB: {path}")
    doc, binary = None, b""
    offset = 12
    while offset < len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        chunk = raw[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    if doc is None:
        raise ValueError("Missing GLB JSON")
    return doc, binary


def write_glb(path, doc, binary):
    doc = copy.deepcopy(doc)
    doc["buffers"] = [{"byteLength": len(binary)}]
    js = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    js += b" " * (-len(js) % 4)
    binary += b"\0" * (-len(binary) % 4)
    payload = struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
    Path(path).write_bytes(struct.pack("<III", 0x46546C67, 2, len(payload) + 12) + payload)


def accessor_refs(doc):
    """Mutable (dictionary, key) references to all geometry/skin accessors."""
    refs = []
    for mesh in doc.get("meshes", []):
        for primitive in mesh["primitives"]:
            refs.extend((primitive["attributes"], k) for k in primitive["attributes"])
            if "indices" in primitive:
                refs.append((primitive, "indices"))
            for target in primitive.get("targets", []):
                refs.extend((target, k) for k in target)
    refs.extend((skin, "inverseBindMatrices") for skin in doc.get("skins", []) if "inverseBindMatrices" in skin)
    for animation in doc.get("animations", []):
        for sampler in animation["samplers"]:
            refs.extend(((sampler, "input"), (sampler, "output")))
    return refs


def compact(doc, binary):
    """Remove unreferenced geometry accessors/views without re-encoding data."""
    refs = accessor_refs(doc)
    used = sorted({d[k] for d, k in refs})
    remap = {old: new for new, old in enumerate(used)}
    doc["accessors"] = [doc["accessors"][i] for i in used]
    for d, k in refs:
        d[k] = remap[d[k]]
    view_refs = [(a, "bufferView") for a in doc["accessors"] if "bufferView" in a]
    for a in doc["accessors"]:
        if "sparse" in a:
            view_refs.extend(((a["sparse"]["indices"], "bufferView"), (a["sparse"]["values"], "bufferView")))
    view_refs.extend((i, "bufferView") for i in doc.get("images", []) if "bufferView" in i)
    views, output, view_map = [], bytearray(), {}
    for i in sorted({d[k] for d, k in view_refs}):
        old = doc["bufferViews"][i]
        if old.get("buffer", 0) != 0:
            raise ValueError("Frozen parts require an embedded GLB buffer")
        view = copy.deepcopy(old)
        output.extend(b"\0" * (-len(output) % 4))
        view["byteOffset"], view["buffer"] = len(output), 0
        start = old.get("byteOffset", 0)
        output.extend(binary[start:start + old["byteLength"]])
        view_map[i] = len(views)
        views.append(view)
    for d, k in view_refs:
        d[k] = view_map[d[k]]
    doc["bufferViews"] = views
    return bytes(output)


def retain_parts(target_path, baseline_path, names):
    doc, raw = read_glb(target_path)
    source, source_raw = read_glb(baseline_path)
    binary = bytearray(raw)
    source_nodes = {n.get("name"): n for n in source["nodes"]}
    nodes = {n.get("name"): n for n in doc["nodes"]}
    materials = {m.get("name"): i for i, m in enumerate(doc.get("materials", []))}
    accessors, views = {}, {}
    node_indices = {n.get("name"): i for i, n in enumerate(doc["nodes"])}
    old_joints = [source["nodes"][i].get("name") for i in source["skins"][0]["joints"]]
    if any(name not in node_indices for name in old_joints):
        raise ValueError("Frozen parts require the same named joints")

    def copy_accessor(index):
        if index in accessors:
            return accessors[index]
        accessor = copy.deepcopy(source["accessors"][index])
        if "sparse" in accessor:
            raise ValueError("Sparse frozen accessors are unsupported")
        old_view = accessor["bufferView"]
        if old_view not in views:
            view = copy.deepcopy(source["bufferViews"][old_view])
            start = view.get("byteOffset", 0)
            binary.extend(b"\0" * (-len(binary) % 4))
            view["byteOffset"], view["buffer"] = len(binary), 0
            binary.extend(source_raw[start:start + view["byteLength"]])
            views[old_view] = len(doc["bufferViews"])
            doc["bufferViews"].append(view)
        accessor["bufferView"] = views[old_view]
        accessors[index] = len(doc["accessors"])
        doc["accessors"].append(accessor)
        return accessors[index]

    # Give retained parts their original ordered skin. Export joint ordering
    # may change with body topology, but JOINTS/WEIGHTS bytes stay untouched.
    skin = copy.deepcopy(source["skins"][0])
    skin["joints"] = [node_indices[name] for name in old_joints]
    if "skeleton" in skin:
        skin["skeleton"] = node_indices[source["nodes"][skin["skeleton"]]["name"]]
    skin["inverseBindMatrices"] = copy_accessor(skin["inverseBindMatrices"])
    retained_skin = len(doc["skins"])
    doc["skins"].append(skin)
    # The cape spring guides also sample draping. Retain their rest transforms
    # together with the excluded geometry so the bind pose stays identical.
    for old in source["nodes"]:
        if old.get("name", "").startswith("cape") and old["name"] in nodes:
            target = nodes[old["name"]]
            for key in ("translation", "rotation", "scale", "matrix"):
                if key in old:
                    target[key] = copy.deepcopy(old[key])
                else:
                    target.pop(key, None)
    for name in names:
        old, target = source_nodes[name], nodes[name]
        mesh = copy.deepcopy(source["meshes"][old["mesh"]])
        for primitive in mesh["primitives"]:
            primitive["attributes"] = {k: copy_accessor(v) for k, v in primitive["attributes"].items()}
            if "indices" in primitive:
                primitive["indices"] = copy_accessor(primitive["indices"])
            if "material" in primitive:
                material = source["materials"][primitive["material"]]
                if material.get("name") not in materials:
                    materials[material.get("name")] = len(doc["materials"])
                    doc["materials"].append(copy.deepcopy(material))
                primitive["material"] = materials[material.get("name")]
        doc["meshes"][target["mesh"]] = mesh
        target["skin"] = retained_skin
        for key in ("translation", "rotation", "scale", "matrix"):
            if key in old:
                target[key] = copy.deepcopy(old[key])
            else:
                target.pop(key, None)
    write_glb(target_path, doc, compact(doc, bytes(binary)))


def extract_parts(source_path, output_path, names, origin):
    doc, binary = read_glb(source_path)
    meshes = []
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        if node.get("name") in names:
            meshes.append(doc["meshes"][node["mesh"]])
            node["mesh"] = len(meshes) - 1
        else:
            node.pop("mesh")
    doc["meshes"] = meshes
    doc["asset"]["extras"] = {"frozen_parts_origin": origin, "parts": list(names)}
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    write_glb(output_path, doc, compact(doc, binary))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extract", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--names", nargs="+", required=True)
    parser.add_argument("--origin", required=True)
    args = parser.parse_args()
    extract_parts(args.extract, args.out, args.names, args.origin)

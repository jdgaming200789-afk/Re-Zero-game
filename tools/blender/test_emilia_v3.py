"""Export the first V3 upper-torso experiment, without building any garments.

One current uncut body is constructed, exported as the rollback baseline,
patched in place, then exported as the test. Existing head / ears are copied
from the unchanged game GLB for context. Render is a separate command.
"""
from __future__ import annotations

import argparse
import hashlib
import inspect
import json
import sys
import time
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE / "characters"))
sys.path.insert(0, str(HERE))


def log(message):
    print(f"[v3-build {time.monotonic():.3f}] {message}", flush=True)


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def mesh_hash(body):
    value = [[int(i) for i in f.vertices] for f in body.data.polygons]
    return hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()


def locked_files(lock):
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == digest
            for p, digest in lock["sha256"].items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    lock = json.loads((out / "rollback-lock.json").read_text())
    assert all(locked_files(lock).values()), "Rollback-locked source / guide / asset differs"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    from emilia_arc6 import emilia_arc6
    from humanoid import Joints, build_body
    from emilia_torso_surface import rebuild_upper_torso
    from emilia_v3_surface import FrozenV3Surface
    from audit_emilia import topology, surface_crossings

    # Capture the existing loft's provenance at its final mesh write. This
    # read-only hook does not modify source, topology, coordinates or fairing.
    source, first_line = inspect.getsourcelines(rebuild_upper_torso)
    capture_line = first_line + next(i for i, s in enumerate(source) if "bm.to_mesh(obj.data)" in s)
    provenance = []
    def tracer(frame, event, arg):
        if frame.f_code is rebuild_upper_torso.__code__:
            if event == "line" and frame.f_lineno == capture_line:
                bm = frame.f_locals["bm"]
                bm.verts.index_update()
                provenance.extend((v.index, float(t), float(z))
                                  for v, (t, z) in frame.f_locals["parameters"].items() if v.is_valid)
            return tracer
        return None
    spec = emilia_arc6()
    height = spec.body.height
    log("construct CURRENT uncut body once; no garments, hair, cape, ornaments or character suite")
    previous_trace = sys.gettrace()
    sys.settrace(tracer)
    try:
        body = build_body("emilia_v3_test_body", spec.body, Joints(spec.body))
    finally:
        sys.settrace(previous_trace)
    assert provenance, "Loft provenance was not captured"
    log(f"body ready: {len(body.data.vertices)} vertices; {len(provenance)} existing loft vertices")
    topo_before, faces_hash = topology(body), mesh_hash(body)
    log("audit complete baseline body intersections")
    crossings_before = surface_crossings(body)

    # Head / elf ears are immutable context, imported from the current GLB.
    # No head builder is called; no armature posing or garment code is run.
    game = ROOT / "public/assets/models/characters/emilia.glb"
    log("load existing GLB for immutable head context")
    bpy.ops.import_scene.gltf(filepath=str(game))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    heads = []
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and (obj.name == "emilia_head" or "part_elfears" in obj.name):
            data = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
            data.transform(obj.matrix_world)
            context = bpy.data.objects.new("locked_context_" + obj.name, data)
            bpy.context.scene.collection.objects.link(context)
            heads.append(context)
    assert heads, "Existing head context is unavailable"
    for obj in list(bpy.data.objects):
        if obj is not body and obj not in heads:
            bpy.data.objects.remove(obj, do_unlink=True)
    head_before = {h.name: np.array([v.co[:] for v in h.data.vertices]) for h in heads}
    mat = bpy.data.materials.new("Body test clay")
    mat.diffuse_color = (.36, .38, .42, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (.36, .38, .42, 1)
    node.inputs["Roughness"].default_value = .88
    body.data.materials.clear()
    body.data.materials.append(mat)

    def export(filename):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in [body] + heads:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = body
        path = out / filename
        log(f"export {filename}")
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                  export_animations=False, export_skins=False,
                                  export_materials="EXPORT", export_extras=True)
        assert path.stat().st_size > 1000
        return hashlib.sha256(path.read_bytes()).hexdigest()

    baseline_sha = export("body-before-v3.glb")
    frozen_path = ROOT / "docs/model-reviews/emilia-arc6-v3-s4-cross-validation/frozen-guide-v3.json"
    log("register frozen V3 once and solve front / side / oblique section constraints together")
    surface = FrozenV3Surface(frozen_path, spec.body.extra["torso_contours"])
    log("apply only existing upper-torso grid vertices; lock graft / arms / lower body")
    before, after, weights, fit = surface.apply(body, provenance, height)
    assert mesh_hash(body) == faces_hash, "Mesh connectivity changed"
    for h in heads:
        assert np.array_equal(head_before[h.name], np.array([v.co[:] for v in h.data.vertices]))
    log("audit complete test body intersections")
    topo_after, crossings_after = topology(body), surface_crossings(body)
    test_sha = export("body-v3-test.glb")
    file_checks = locked_files(lock)
    assert all(file_checks.values()), "Locked source, guide, garment or asset changed"
    np.savez_compressed(out / "vertex-lock.npz", before=before, after=after, weights=weights,
                        provenance=np.array(provenance), head_vertices_unchanged=True)
    report = {"authorization": "FIRST GEOMETRY TEST ONLY; resulting body not approved",
              "height": height, "baseline": "CURRENT body from rollback b6ccdda; regression comparison only",
              "build_count": 1, "garment_build_count": 0, "game_asset_written": False,
              "test_glb_sha256": test_sha, "baseline_glb_sha256": baseline_sha,
              "topology_before": topo_before, "topology_after": topo_after,
              "face_connectivity_before_sha256": faces_hash, "face_connectivity_after_sha256": mesh_hash(body),
              "surface_intersections_before": crossings_before, "surface_intersections_after": crossings_after,
              "immutable_head_objects": list(head_before), "head_vertices_changed": 0,
              "locked_file_checks": file_checks, "fit": fit, "blender": bpy.app.version_string}
    save_json(out / "geometry-test.json", report)
    log(f"DONE: {fit['changed_vertices']} torso vertices changed; all {fit['locked_vertices']} protected body vertices exact; zero topology changes")


if __name__ == "__main__":
    main()

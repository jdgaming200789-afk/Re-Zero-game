"""Render ONE view from an already exported body-test GLB. Never rebuild.

The six camera definitions are imported unchanged from review_emilia.py.
Invoke each view with an external timeout. Completed images are reused and
every import / setup / render / save step is logged separately.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import bpy
from mathutils import Vector

from review_emilia import VIEWS, light


def log(message):
    print(f"[v3-render {time.monotonic():.3f}] {message}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--view", required=True, choices=[*VIEWS, "curvature_three_quarter"])
    parser.add_argument("--height", type=float, default=1.64)
    args = parser.parse_args()
    out, glb = Path(args.out).resolve(), Path(args.glb).resolve()
    out.mkdir(parents=True, exist_ok=True)
    image = out / f"{args.view}.png"
    if image.exists():
        from PIL import Image
        with Image.open(image) as im:
            im.load()
            assert im.size == (600, 720)
        log(f"reuse completed {image.name}; no render")
        return
    start = time.monotonic()
    log(f"LOAD GLB {glb.name} ({glb.stat().st_size} bytes)")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    assert meshes and all(o.name.startswith(("emilia_v3_test_body", "locked_context_")) for o in meshes)
    assert not any(o.type == "ARMATURE" for o in bpy.data.objects), "Static body test only"
    log(f"GLB LOADED: {len(meshes)} meshes; no garments; no arm posing")
    mat = bpy.data.materials.new("Uniform diagnostic clay")
    mat.use_nodes = True
    node = mat.node_tree.nodes["Principled BSDF"]
    node.inputs["Base Color"].default_value = (.36, .38, .42, 1)
    node.inputs["Roughness"].default_value = .88
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24 if args.view == "curvature_three_quarter" else 12
    scene.cycles.use_denoising = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    scene.render.resolution_x, scene.render.resolution_y = 600, 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -.55
    scene.world = bpy.data.worlds.new("Review world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.095, .105, .125, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .7
    if args.view == "curvature_three_quarter":
        light("Curvature key", (-3, -3, 2.3), 330, 1.7)
        light("Curvature fill", (3, -1, 3), 70, 3)
        light("Curvature rim", (1, 3, 4), 180, 3)
        node.inputs["Roughness"].default_value = .58
    else:
        light("Key", (-3, -4, 5), 420, 3.5)
        light("Fill", (3, -1, 3), 180, 3)
        light("Rim", (1, 3, 4), 250, 3)
    camera = bpy.data.objects.new("Fixed review camera", bpy.data.cameras.new("Fixed review camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    azimuth, elevation, centre, scale = VIEWS["three_quarter" if args.view == "curvature_three_quarter" else args.view]
    az, el = math.radians(azimuth), math.radians(elevation)
    target = Vector((0, 0, centre * args.height))
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    camera.location = target + direction * 8
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = scale * args.height
    scene.render.filepath = str(image)
    log(f"CAMERA ready: {args.view}, orthographic az={azimuth}, el={elevation}, target={list(target)}, scale={camera.data.ortho_scale}")
    log("RENDER start")
    bpy.ops.render.render(write_still=True)
    log(f"PNG SAVED {image.name}")
    from PIL import Image
    with Image.open(image) as im:
        im.load()
        assert im.size == (600, 720)
    record = {"source_glb_sha256": hashlib.sha256(glb.read_bytes()).hexdigest(),
              "view": args.view, "projection": "orthographic", "azimuth": azimuth,
              "elevation": elevation, "target": list(target), "scale": camera.data.ortho_scale,
              "resolution": [600, 720], "arm_sweep_degrees": 0, "meshes": [o.name for o in meshes],
              "lighting": "curvature" if args.view == "curvature_three_quarter" else "original review",
              "elapsed_seconds": time.monotonic() - start, "blender": bpy.app.version_string}
    (out / f"{args.view}.json").write_text(json.dumps(record, indent=2) + "\n")
    log(f"DONE in {record['elapsed_seconds']:.2f}s")


if __name__ == "__main__":
    main()

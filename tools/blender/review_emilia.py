"""Render an exported Emilia GLB with reproducible proportion-check cameras.

Run with the same Python/Blender installation as build_characters.py:
    python tools/blender/review_emilia.py --glb path/emilia.glb --out path/review

Both body-only and garment builds use these exact orthographic cameras. Hair,
cloak and hoods are hidden only in this review scene. The exported asset is
never edited. Arms are swept behind the torso to expose the true side contour.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector


VIEWS = {
    "front": (0, 0, 0.695, 0.43),
    "three_quarter": (40, 0, 0.695, 0.43),
    "side": (90, 0, 0.695, 0.43),
    "low_front": (0, -14, 0.695, 0.43),
    "full_front": (0, 0, 0.505, 1.11),
    "full_side": (90, 0, 0.505, 1.11),
}


def light(name, position, energy, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size = energy, "DISK", size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector((0, 0, 1.1)) - obj.location).to_track_quat("-Z", "Y").to_euler()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--height", type=float, default=1.64)
    parser.add_argument("--clay", action="store_true")
    parser.add_argument("--samples", type=int, default=12)
    parser.add_argument("--views", nargs="+", default=list(VIEWS))
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.glb).resolve()))
    hidden = []
    for obj in bpy.data.objects:
        if obj.type == "MESH" and any(key in obj.name.lower() for key in ("hair", "part_cloak", "part_hood", "part_ornaments")):
            obj.hide_render = True
            hidden.append(obj.name)
        if obj.type == "ARMATURE":
            for name in ("upperArm.L", "upperArm.R"):
                bone = obj.pose.bones.get(name)
                if bone:
                    rest = bone.bone.matrix_local.to_quaternion()
                    bone.rotation_mode = "QUATERNION"
                    bone.rotation_quaternion = rest.inverted() @ Quaternion((1, 0, 0), math.radians(58)) @ rest
    if args.clay:
        mat = bpy.data.materials.new("Review clay")
        mat.use_nodes = True
        node = mat.node_tree.nodes.get("Principled BSDF")
        node.inputs["Base Color"].default_value = (0.36, 0.38, 0.42, 1)
        node.inputs["Roughness"].default_value = 0.88
        for obj in bpy.data.objects:
            if obj.type == "MESH":
                for i in range(len(obj.data.materials)):
                    obj.data.materials[i] = mat
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    scene.render.resolution_x, scene.render.resolution_y = 600, 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.55
    scene.world = bpy.data.worlds.new("Review world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.095, 0.105, 0.125, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    light("Key", (-3, -4, 5), 420, 3.5)
    light("Fill", (3, -1, 3), 180, 3)
    light("Rim", (1, 3, 4), 250, 3)
    cam_data = bpy.data.cameras.new("Review camera")
    cam = bpy.data.objects.new("Review camera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.type = "ORTHO"
    records = {}
    for name in args.views:
        az, el, centre, scale = VIEWS[name]
        az, el = math.radians(az), math.radians(el)
        target = Vector((0, 0, centre * args.height))
        direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        cam.location = target + direction * 8
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam_data.ortho_scale = scale * args.height
        scene.render.filepath = str((out / f"{name}.png").resolve())
        bpy.ops.render.render(write_still=True)
        records[name] = {"projection": "orthographic", "azimuth": math.degrees(az), "elevation": math.degrees(el), "target": list(target), "scale": cam_data.ortho_scale}
    (out / "cameras.json").write_text(json.dumps({"source": args.glb, "hidden": hidden, "arm_sweep_degrees": 58, "cameras": records}, indent=2) + "\n")
    from PIL import Image, ImageDraw

    sheet = Image.new("RGB", (1200, 520 * math.ceil(len(args.views) / 3)), (45, 49, 57))
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(args.views):
        x, y = i % 3 * 400, i // 3 * 520
        with Image.open(out / f"{name}.png") as im:
            sheet.paste(im.resize((400, 480)), (x, y + 40))
        draw.text((x + 15, y + 12), name.replace("_", " "), fill=(235, 238, 245), font_size=19)
    sheet.save(out / "sheet.jpg", quality=94)
    (out / "source.json").write_text(json.dumps({"glb_sha256": hashlib.sha256(Path(args.glb).read_bytes()).hexdigest(), "blender": bpy.app.version_string, "clay": args.clay, "samples": args.samples}, indent=2) + "\n")


if __name__ == "__main__":
    import sys
    if "--" in sys.argv:
        sys.argv = [sys.argv[0]] + sys.argv[sys.argv.index("--") + 1:]
    main()

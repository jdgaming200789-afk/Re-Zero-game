"""Character assembly and export.

    python tools/blender/characters/build_characters.py [id ...]

Pipeline per character:
  armature → skin body (auto weights) → head + ears (rigid) → hair (head +
  spring chains) → garments (hips/chest + spring chains) → glTF.
"""
from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import dataclass, field
from typing import Callable

import bpy  # noqa: F401
import bmesh
from mathutils import Vector

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

from humanoid import BodySpec, Joints, add_chain, build_armature, build_body  # noqa: E402
from head import HeadSpec, build_head  # noqa: E402
from hair import HairStyle, build_hair  # noqa: E402
from outfit import Garments, Rule, make_material, hex3, zone  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "assets", "models", "characters")


@dataclass
class CharacterSpec:
    id: str
    body: BodySpec
    head: HeadSpec
    hair: HairStyle
    palette: dict[str, tuple[str, str]]  # material -> (hex, role)
    zones: list[Rule]
    default_zone: str
    face: dict
    garments: Callable[[Joints, dict], Garments] | None = None
    accessories: Callable[[Joints, dict, object], list] | None = None
    meta: dict = field(default_factory=dict)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def select_only(*objs):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[-1]


def rigid(obj, arm, bone: str):
    """Bind every vertex of obj to one bone."""
    obj.vertex_groups.clear()
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj.parent = arm
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def resample(line: list[Vector], n: int) -> list[Vector]:
    """Resample a polyline to n+1 evenly spaced points."""
    lengths = [0.0]
    for a, b in zip(line, line[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1] or 1.0
    out = []
    for i in range(n + 1):
        d = total * i / n
        k = 1
        while k < len(lengths) - 1 and lengths[k] < d:
            k += 1
        t = (d - lengths[k - 1]) / max(1e-6, lengths[k] - lengths[k - 1])
        out.append(line[k - 1].lerp(line[k], min(1.0, max(0.0, t))))
    return out


def add_chains(arm, chains: dict[str, list[Vector]], counts: dict[str, int], parent_of: Callable[[str], str]) -> dict[str, list[str]]:
    names = {}
    for chain, guide in chains.items():
        n = counts.get(chain, 4)
        pts = resample(guide, n)
        bones = [(f"{chain}_{i}", pts[i], pts[i + 1]) for i in range(n)]
        add_chain(arm, bones, parent_of(chain))
        names[chain] = [b[0] for b in bones]
    return names


def weight_by_chain(obj, arm, base_bone: str, chain_bones: list[str], guide: list[Vector], root_hold: float = 0.08):
    """Blend vertices along a chain by their projection onto the guide."""
    if base_bone not in obj.vertex_groups:
        obj.vertex_groups.new(name=base_bone)
    groups = {b: (obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b)) for b in chain_bones}
    pts = resample(guide, len(chain_bones))
    seg_len = [(pts[i + 1] - pts[i]).length for i in range(len(chain_bones))]
    total = sum(seg_len)
    base = obj.vertex_groups[base_bone]
    for v in obj.data.vertices:
        p = v.co
        # nearest point on polyline → arc-length parameter
        best = (1e9, 0.0)
        acc = 0.0
        for i in range(len(chain_bones)):
            a, b = pts[i], pts[i + 1]
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
            d = (a + ab * t - p).length
            if d < best[0]:
                best = (d, (acc + t * seg_len[i]) / total)
            acc += seg_len[i]
        s = best[1]
        if s < root_hold:
            base.add([v.index], 1.0 - s / root_hold * 0.5, "REPLACE")
        f = s * len(chain_bones)
        i0 = min(int(f), len(chain_bones) - 1)
        frac = f - i0
        groups[chain_bones[i0]].add([v.index], 1.0 - frac * 0.5, "ADD")
        if i0 + 1 < len(chain_bones):
            groups[chain_bones[i0 + 1]].add([v.index], frac * 0.5, "ADD")


def build(spec: CharacterSpec) -> str:
    reset()
    j = Joints(spec.body)
    mats = {name: make_material(f"M_{spec.id}_{name}", hex3(hx), role) for name, (hx, role) in spec.palette.items()}

    arm = build_armature(spec.id, j)
    body = build_body(f"{spec.id}_body", spec.body, j)
    zone(body, j, spec.zones, mats, spec.default_zone)
    # Auto (heat) weights for the body against the humanoid bones only.
    select_only(body, arm)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    head, meta = build_head(f"{spec.id}_head", j, spec.head)
    head.data.materials.append(mats["face"])
    head["face"] = json.dumps({**meta_face(meta), **spec.face})
    ears = meta["ears"]
    ears.data.materials.append(mats["skin"])

    hair, hmeta = build_hair(f"{spec.id}_hair", j, head, spec.head, spec.hair)
    hair.data.materials.clear()
    hair.data.materials.append(mats["hair"])
    extra_mats = [m for m in mats if m.startswith("hair_")]
    for m in extra_mats:
        hair.data.materials.append(mats[m])

    garments = spec.garments(j, mats) if spec.garments else Garments()
    acc = spec.accessories(j, mats, head) if spec.accessories else []

    # Spring chains: hair under the head, cloth under hips/chest.
    hair_chains = {k: v for k, v in hmeta["chains"].items()}
    hair_names = add_chains(arm, hair_chains, spec.hair.chains, lambda c: "head")
    cloth_names = add_chains(arm, garments.chains, {k: 3 for k in garments.chains}, lambda c: "upperChest" if c.startswith("cape") else "hips")

    for o in (head, ears):
        rigid(o, arm, "head")
    for o in acc:
        rigid(o, arm, o.get("bone", "head"))

    # Hair: rigid to head, chain-bound vertex runs blended along their chain.
    rigid(hair, arm, "head")
    bound = hmeta["bound"]
    hg = hair.vertex_groups["head"]
    for chain, verts in bound.items():
        bones = hair_names[chain]
        groups = [hair.vertex_groups.new(name=b) for b in bones]
        n = len(bones)
        for vidx, t in verts:
            if t < 0.12:
                continue
            f = min(0.999, (t - 0.12) / 0.88) * n
            i0 = int(f)
            frac = f - i0
            hg.add([vidx], max(0.0, 1.0 - (t - 0.12) * 4), "REPLACE")
            groups[i0].add([vidx], 1.0 - frac * 0.5, "ADD")
            if i0 + 1 < n:
                groups[i0 + 1].add([vidx], frac * 0.5, "ADD")

    for o in garments.objects:
        chains = garments.bindings.get(o.name, [])
        base_bone = o.get("bone", "hips")
        if not chains:
            rigid(o, arm, base_bone)
            continue
        rigid(o, arm, base_bone)
        # Each vertex follows its nearest chain(s), blended by height.
        assign_nearest_chain(o, arm, base_bone, {c: (cloth_names[c], garments.chains[c]) for c in chains})

    arm["character"] = spec.id
    arm["meta"] = json.dumps(spec.meta)
    for o in bpy.data.objects:
        if o.type == "MESH":
            o["character"] = spec.id

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{spec.id}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_extras=True,
        export_skins=True,
        export_apply=True,
        export_materials="EXPORT",
        export_animations=False,
        export_def_bones=False,
    )
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"{spec.id}: {tris} tris, {len(arm.data.bones)} bones → {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1024:.0f} KB)")
    return path


def assign_nearest_chain(obj, arm, base_bone: str, chains: dict[str, tuple[list[str], list[Vector]]]):
    base = obj.vertex_groups[base_bone]
    groups = {}
    for c, (bones, _) in chains.items():
        for b in bones:
            groups[b] = obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b)
    guides = {c: resample(g, len(bones)) for c, (bones, g) in chains.items()}
    for v in obj.data.vertices:
        p = v.co
        # two nearest chains by horizontal distance to their top point
        scored = sorted(chains.keys(), key=lambda c: (Vector((p.x, p.y, 0)) - Vector((guides[c][-1].x, guides[c][-1].y, 0))).length)
        c0 = scored[0]
        bones = chains[c0][0]
        top_z = guides[c0][0].z
        bot_z = guides[c0][-1].z
        s = max(0.0, min(1.0, (top_z - p.z) / max(1e-6, top_z - bot_z)))
        if s < 0.08:
            continue  # stays on the base bone
        base.add([v.index], max(0.0, 1.0 - s * 3.0), "REPLACE")
        f = min(0.999, s) * len(bones)
        i0 = int(f)
        frac = f - i0
        w_near = 1.0
        if len(scored) > 1:
            c1 = scored[1]
            d0 = (Vector((p.x, p.y, 0)) - Vector((guides[c0][-1].x, guides[c0][-1].y, 0))).length
            d1 = (Vector((p.x, p.y, 0)) - Vector((guides[c1][-1].x, guides[c1][-1].y, 0))).length
            w_near = d1 / max(1e-6, d0 + d1)
            b1 = chains[c1][0]
            groups[b1[min(i0, len(b1) - 1)]].add([v.index], (1 - w_near) * (1 - frac * 0.5), "ADD")
        groups[bones[i0]].add([v.index], w_near * (1 - frac * 0.5), "ADD")
        if i0 + 1 < len(bones):
            groups[bones[i0 + 1]].add([v.index], w_near * frac * 0.5, "ADD")


def meta_face(meta: dict) -> dict:
    return {k: meta[k] for k in ("faceCenter", "faceHalfWidth", "faceHalfHeight", "eyeLine")}

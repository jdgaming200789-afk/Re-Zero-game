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
import mathutils
import mathutils.kdtree
from mathutils import Vector

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

from humanoid import BodySpec, Joints, add_chain, build_armature, build_body, build_hand  # noqa: E402
from head import HeadSpec, build_head  # noqa: E402
from hair import HairStyle, build_hair  # noqa: E402
from outfit import Garments, Rule, make_material, hex3, zone  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.environ.get("CHAR_OUT_DIR") or os.path.join(ROOT, "public", "assets", "models", "characters")


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
    # Planes (point, normal) the body is cut along before zoning, so colour
    # boundaries follow clean lines instead of the stair-step of whole faces.
    cuts: Callable[[Joints], list] | None = None
    # Scalar fields f(point) whose zero level the body is also cut along
    # (for curved colour boundaries).
    iso_cuts: Callable[[Joints], list] | None = None
    # Body faces hidden under opaque garments (deleted after tailoring, so
    # they can't poke through the clothes when joints bend).
    hidden: Callable[[object], bool] | None = None
    # Make the ears a part the game can hide (under a hood worn up).
    ear_part: str | None = None


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


def skinned(obj, arm):
    """Parent a pre-weighted mesh (tailored garment) to the armature."""
    obj.parent = arm
    if not any(m.type == "ARMATURE" for m in obj.modifiers):
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
    else:
        for m in obj.modifiers:
            if m.type == "ARMATURE":
                m.object = arm


def hide_under(body, j, pred) -> None:
    from outfit import ZoneContext

    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.normal_update()
    kill = [f for f in bm.faces if pred(ZoneContext(j, f.calc_center_median(), f.normal.copy()))]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()


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


def cut_planes(obj, planes) -> None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def iso_cut(obj, fields, snap: float = 0.2) -> None:
    """Cut the mesh along the zero level of each field, so a curved boundary
    becomes a clean edge loop. Crossed faces are triangulated first (a triangle is
    crossed at most twice, so every crossing face is split); a vertex that
    lies within `snap` of an edge's length from the crossing is moved onto
    it instead of leaving a sliver triangle beside it."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for f in fields:
        val = {v: f(v.co) for v in bm.verts}
        crossed = [
            x for x in bm.faces
            if len(x.verts) > 3
            and min(val[v] for v in x.verts) < 0 < max(val[v] for v in x.verts)
        ]
        bmesh.ops.triangulate(bm, faces=crossed)
        for v in list(bm.verts):
            best = None
            for e in v.link_edges:
                o = e.other_vert(v)
                fa, fb = val[v], val[o]
                if fa * fb < 0:
                    t = fa / (fa - fb)
                    if t < snap and (best is None or t < best[0]):
                        best = (t, o)
            if best:
                t, o = best
                v.co = v.co.lerp(o.co, t)
                val[v] = 0.0
        new = set()
        for e in list(bm.edges):
            a, b = e.verts
            fa, fb = val[a], val[b]
            if fa * fb < 0:
                _e, nv = bmesh.utils.edge_split(e, a, fa / (fa - fb))
                val[nv] = 0.0
                new.add(nv)
        for face in list(bm.faces):
            on = [v for v in face.verts if v in new or val[v] == 0.0]
            if len(on) == 2 and not any(on[1] in e.verts for e in on[0].link_edges):
                bmesh.ops.connect_verts(bm, verts=on)
    bmesh.ops.triangulate(bm, faces=[x for x in bm.faces if len(x.verts) > 4])
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def report_intersections(obj, H: float, label: str) -> int:
    """Print how many faces of `obj` cross each other (not merely touching
    neighbours), binned by height / |x| (fractions of H). EMILIA review aid."""
    from mathutils.bvhtree import BVHTree
    import collections
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    pairs = [
        (a, b) for a, b in tree.overlap(tree)
        if a < b and not {v.index for v in bm.faces[a].verts} & {v.index for v in bm.faces[b].verts}
    ]
    reg = collections.Counter()
    for a, _b in pairs:
        c = bm.faces[a].calc_center_median()
        reg[(round(c.z / H, 2), round(abs(c.x) / H, 2), "front" if c.y < 0 else "back")] += 1
    print(f"  intersections[{label}]: {len(pairs)}", sorted(reg.items(), key=lambda kv: -kv[1])[:12])
    bm.free()
    return len(pairs)


def build(spec: CharacterSpec) -> str:
    reset()
    j = Joints(spec.body)
    mats = {name: make_material(f"M_{spec.id}_{name}", hex3(hx), role) for name, (hx, role) in spec.palette.items()}

    arm = build_armature(spec.id, j)
    body = build_body(f"{spec.id}_body", spec.body, j)
    check = os.environ.get("BODY_CHECK")
    if check:
        report_intersections(body, j.H, "body")
    if spec.cuts:
        cut_planes(body, spec.cuts(j))
    if spec.iso_cuts:
        iso_cut(body, spec.iso_cuts(j))
    zone(body, j, spec.zones, mats, spec.default_zone)
    if check:
        report_intersections(body, j.H, "after cuts")
    # Auto (heat) weights for the body against the humanoid bones only.
    select_only(body, arm)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # Modelled hands, rigid to the hand bones, merged into the body mesh.
    for side, bone in ((1, "hand.L"), (-1, "hand.R")):
        hand = build_hand(f"{spec.id}_hand{side}", spec.body, j, side)
        zone(hand, j, spec.zones, mats, spec.default_zone)
        if body.data.color_attributes.get("Col"):
            col = hand.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
            for c in col.data:
                c.color = (1, 1, 1, 1)
        rigid(hand, arm, bone)
        select_only(hand, body)
        bpy.ops.object.join()

    head, meta = build_head(f"{spec.id}_head", j, spec.head)
    head.data.materials.append(mats["face"])
    head["face"] = json.dumps({**meta_face(meta), **spec.face})
    ears = meta["ears"]
    ears.data.materials.append(mats["skin"])
    if spec.ear_part:
        ears["part"] = spec.ear_part

    hair, hmeta = build_hair(f"{spec.id}_hair", j, head, spec.head, spec.hair)
    # Slot 0 = hair; slot 1 = "hair_tip" (dyed tips) when the palette has one.
    # The cap (joined last) keeps slot 0.
    # Assign in place: clearing the slots would reset every face's index.
    hair.data.materials[0] = mats["hair"]
    if "hair_tip" in mats:
        hair.data.materials[1] = mats["hair_tip"]
    else:
        hair.data.materials.pop(index=1)

    # Garments drape onto the finished body (collars, capes).
    j.body = body
    # Hair chain guides, for accessories that ride a hair spring chain (braids).
    j.hair_chains = hmeta["chains"]
    garments = spec.garments(j, mats) if spec.garments else Garments()
    acc = spec.accessories(j, mats, head) if spec.accessories else []

    # Spring chains: hair under the head, cloth under hips/chest.
    hair_chains = {k: v for k, v in hmeta["chains"].items()}
    hair_names = add_chains(arm, hair_chains, spec.hair.chains, lambda c: "head")
    cloth_names = add_chains(arm, garments.chains, {k: 3 for k in garments.chains}, lambda c: "upperChest" if c.startswith(("cape", "scarf", "hood", "robe")) else "hips")

    for o in (head, ears):
        rigid(o, arm, "head")
    for o in acc:
        if o.get("skinned"):
            skinned(o, arm)
        elif o.get("chain") in hair_names:
            # A braid or ornament that swings with a hair chain.
            c = o["chain"]
            rigid(o, arm, "head")
            assign_along_chain(o, "head", hair_names[c], hair_chains[c])
        else:
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
        if o.get("skinned"):
            # Tailored layers carry the body's own skin weights.
            skinned(o, arm)
            continue
        if not chains:
            rigid(o, arm, base_bone)
            continue
        rigid(o, arm, base_bone)
        # Each vertex follows its nearest chain(s), blended by height.
        assign_nearest_chain(o, arm, base_bone, {c: (cloth_names[c], garments.chains[c]) for c in chains})

    if spec.hidden:
        hide_under(body, j, spec.hidden)

    # Hair parts the game toggles (the back hair under a hood) become their
    # own meshes, weights and all.
    hair_parts = split_hair_parts(hair, hmeta.get("parts", []), spec.id)

    consolidate(spec.id, arm, keep={head.name, hair.name, *(o.name for o in hair_parts)})

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
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
    )
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"{spec.id}: {tris} tris, {len(arm.data.bones)} bones → {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1024:.0f} KB)")
    return path


def split_hair_parts(hair, parts: list[str], cid: str) -> list:
    """Move the faces of each tagged hair part into its own object,
    `<cid>_part_<part>` (same material, armature and weights)."""
    attr = hair.data.attributes.get("part")
    if not parts or attr is None:
        return []
    labels = [attr.data[i].value for i in range(len(hair.data.polygons))]
    out = []
    for k, part in enumerate(parts, start=1):
        o = hair.copy()
        o.data = hair.data.copy()
        bpy.context.scene.collection.objects.link(o)
        o.name = f"{cid}_part_{part}"
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if labels[f.index] != k], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
        out.append(o)
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if labels[f.index] != 0], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(hair.data)
    bm.free()
    for o in (hair, *out):
        a = o.data.attributes.get("part")
        if a is not None:
            o.data.attributes.remove(a)
    return out


def assign_along_chain(obj, base_bone: str, bones: list[str], guide: list[Vector]):
    """Weights by arc length along one chain's guide (a ponytail that arcs up
    and back before it falls: height can't say how far along a vertex is)."""
    base = obj.vertex_groups[base_bone]
    groups = [obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b) for b in bones]
    seg = [(guide[i], guide[i + 1]) for i in range(len(guide) - 1)]
    lens = [(b - a).length for a, b in seg]
    total = max(1e-6, sum(lens))
    for v in obj.data.vertices:
        p = v.co
        best, best_s = 1e9, 0.0
        acc_len = 0.0
        for (a, b), L in zip(seg, lens):
            d = b - a
            t = 0.0 if L < 1e-9 else max(0.0, min(1.0, (p - a).dot(d) / (L * L)))
            dist = (a + d * t - p).length
            if dist < best:
                best, best_s = dist, (acc_len + t * L) / total
            acc_len += L
        s = best_s
        if s < 0.06:
            continue
        base.add([v.index], max(0.0, 1.0 - s * 3.0), "REPLACE")
        f = min(0.999, s) * len(bones)
        i0 = int(f)
        frac = f - i0
        groups[i0].add([v.index], 1 - frac * 0.5, "ADD")
        if i0 + 1 < len(bones):
            groups[i0 + 1].add([v.index], frac * 0.5, "ADD")


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


ROLE_ORDER = ["cloth", "metal", "hair", "eye"]


def _base_color(mat) -> tuple[float, float, float]:
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat and mat.use_nodes else None
    if bsdf:
        c = bsdf.inputs["Base Color"].default_value
        return (c[0], c[1], c[2])
    return (1.0, 1.0, 1.0)


def consolidate(cid: str, arm, keep: set[str], skip_roles: frozenset[str] = frozenset()) -> None:
    """Fewer draw calls: bake every garment's material colour into a vertex
    colour, then merge all pieces by shading role into two meshes — skin
    (warm outlines) and everything else (one primitive per role). The face,
    the hair and parts the game toggles (`separate`) stay on their own."""
    cands = [
        o
        for o in bpy.data.objects
        if o.type == "MESH" and o.parent == arm and o.name not in keep and not o.get("separate") and not o.name.startswith("julius_sword")
        and not any(m and m.get("role") in skip_roles for m in o.data.materials)
    ]
    role_mats: dict[str, bpy.types.Material] = {}

    def role_mat(role: str):
        m = role_mats.get(role)
        if m is None:
            m = make_material(f"M_{cid}_vc_{role}", (1.0, 1.0, 1.0), role)
            role_mats[role] = m
        return m

    pieces: dict[str, list] = {"skin": [], "main": []}
    for o in cands:
        part = o.get("part")
        me = o.data
        if not me.materials:
            continue
        point = me.color_attributes.get("Col")
        pvals = [tuple(point.data[i].color[:3]) for i in range(len(me.vertices))] if point and point.domain == "POINT" else None
        corner = me.color_attributes.new("VCol", "FLOAT_COLOR", "CORNER")
        roles = []
        for poly in me.polygons:
            mat = me.materials[poly.material_index] if poly.material_index < len(me.materials) else None
            c = _base_color(mat)
            roles.append(mat.get("role", "cloth") if mat else "cloth")
            for li in poly.loop_indices:
                k = (1.0, 1.0, 1.0)
                if pvals:
                    k = pvals[me.loops[li].vertex_index]
                corner.data[li].color = (c[0] * k[0], c[1] * k[1], c[2] * k[2], 1.0)
        for ca in [a for a in me.color_attributes if a.name != "VCol"]:
            me.color_attributes.remove(ca)
        corner.name = "Col"
        # Re-slot by role: face roles map onto the shared role materials.
        order = [r for r in ["skin"] + ROLE_ORDER if r in set(roles)] + [r for r in dict.fromkeys(roles) if r not in ["skin"] + ROLE_ORDER]
        me.materials.clear()
        for r in order:
            me.materials.append(role_mat(r))
        idx = {r: i for i, r in enumerate(order)}
        for poly, r in zip(me.polygons, roles):
            poly.material_index = idx[r]
        me.color_attributes.active_color = me.color_attributes["Col"]
        if os.environ.get("CONSOLIDATE_DEBUG"):
            print("  consolidate", o.name, order)
        if part:
            # A part the game toggles (a cloak, a hood): its own mesh.
            pieces.setdefault(f"part_{part}", []).append(o)
        elif order == ["skin"]:
            pieces["skin"].append(o)
        elif "skin" in order:
            # Mixed (the zoned body): split its skin off into a copy.
            skin_obj = o.copy()
            skin_obj.data = me.copy()
            bpy.context.scene.collection.objects.link(skin_obj)
            si = idx["skin"]
            # Both halves keep the whole body's smooth normals, so the cut
            # between them does not shade as a crease.
            me.update()
            vn = [v.normal.copy() for v in me.vertices]
            kd = mathutils.kdtree.KDTree(len(me.vertices))
            for i, v in enumerate(me.vertices):
                kd.insert(v.co, i)
            kd.balance()
            for target, drop in ((o, lambda f: f.material_index == si), (skin_obj, lambda f: f.material_index != si)):
                bm = bmesh.new()
                bm.from_mesh(target.data)
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if drop(f)], context="FACES")
                bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
                bm.to_mesh(target.data)
                bm.free()
                tm = target.data
                tm.normals_split_custom_set_from_vertices([vn[kd.find(v.co)[1]] for v in tm.vertices])
            pieces["main"].append(o)
            pieces["skin"].append(skin_obj)
        else:
            pieces["main"].append(o)
    for group, objs in pieces.items():
        objs = [o for o in objs if o.name in bpy.data.objects and len(o.data.polygons)]
        if not objs:
            continue
        select_only(*objs)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        out = bpy.context.view_layer.objects.active
        out.name = f"{cid}_{group}"
        me = out.data
        # Drop material slots no face uses any more, keep the role order.
        used = sorted({p.material_index for p in me.polygons})
        mats = [me.materials[i] for i in used]
        remap = {old: new for new, old in enumerate(used)}
        new_idx = [remap[p.material_index] for p in me.polygons]
        me.materials.clear()
        for m in mats:
            me.materials.append(m)
        for p, i in zip(me.polygons, new_idx):
            p.material_index = i
        if me.color_attributes.get("Col"):
            me.color_attributes.active_color = me.color_attributes["Col"]


def meta_face(meta: dict) -> dict:
    return {k: meta[k] for k in ("faceCenter", "faceHalfWidth", "faceHalfHeight", "eyeLine")}

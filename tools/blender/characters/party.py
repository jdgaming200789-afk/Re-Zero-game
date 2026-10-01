"""Canon detail pass over the party: each spec from roster.py, dressed with
the tailoring tools — real sleeves and cuffs, bows and brooches, braids and
hair ornaments, frilled petticoats, modelled shoes.
"""
from __future__ import annotations

import math

import bpy  # noqa: F401
from mathutils import Matrix, Vector

import accessories as acc
from hair import Clump, HeadFrame
from humanoid import Joints
from outfit import Garments, SkirtSpec, ZoneContext, skirt
import roster as R
import tailor as t


# --------------------------------------------------------------------------- shared


def wrist_cuts(j: Joints, back: float):
    out = []
    for side in (1, -1):
        a = Vector((j.arm_l.x * side, j.arm_l.y, j.arm_l.z))
        w = Vector((j.wrist_l.x * side, j.wrist_l.y, j.wrist_l.z))
        d = (w - a).normalized()
        out.append((w - d * back * j.H, d))
    return out


def arm_axis(j: Joints, side: int):
    a = Vector((j.arm_l.x * side, j.arm_l.y, j.arm_l.z))
    w = Vector((j.wrist_l.x * side, j.wrist_l.y, j.wrist_l.z))
    return a, w, (w - a).normalized()


def sleeves(name: str, j: Joints, mat, *, start: float = 0.02, back: float = 0.006, offset: float = 0.007, bell: float = 0.012, seed: float = 0.9):
    """Long sleeves from the shoulder to the wrist, belling out at the cuff."""
    H = j.H

    def keep(c: ZoneContext) -> bool:
        return c.on_arm() and start * H < c.arm_s() < c.arm_len() - back * H

    def extra(p, n):
        side, s, length, d, radial = t.arm_frame(j, p)
        return t.wrinkles(j, p, arm=0.8, seed=seed) + bell * H * t.smoothstep(length * 0.55, length, s) ** 1.5

    return t.shell(name, j, keep, offset, mat, cuts=wrist_cuts(j, back), thickness=0.003, extra=extra, subdivide=1)


def shoes(g: Garments, prefix: str, j: Joints, upper, sole_mat, **kw) -> None:
    for side in (1, -1):
        g.objects.append(t.shoe(f"{prefix}_shoe{side}", j, side, upper, sole_mat, **kw))


def chest_point(j: Joints, z: float, x: float = 0.0, lift: float = 0.0):
    hit = t.front_point(j, x, z, lift * j.H)
    return hit if hit else (Vector((x, j.chest.y - 0.08 * j.H, z)), Vector((0, -1, 0)))


def under_shoes(c: ZoneContext) -> bool:
    return (not c.on_arm()) and c.p.z < c.j.ankle_l.z - 0.004 * c.H and abs(c.p.x) > 0.01 * c.H


def under_sleeves(c: ZoneContext) -> bool:
    return c.on_arm() and 0.04 * c.H < c.arm_s() < c.arm_len() - 0.03 * c.H


# --------------------------------------------------------------------------- Emilia


def hood_up(name: str, f: HeadFrame, mat, lining, scale: float = 1.34, opening: tuple[float, float] = (66.0, 52.0)) -> bpy.types.Object:
    """A hood worn up: a shell round the head, open at the face, tucking in
    towards the neck at the back. Outer faces take `mat`, inner `lining`."""
    import bmesh

    bm = bmesh.new()
    azs = list(range(-180, 180, 9))
    els = list(range(-60, 91, 8))
    verts = {}
    for az in azs:
        for el in els:
            if abs(az) < opening[0] and el < opening[1]:
                continue
            a, e = math.radians(az), math.radians(el)
            n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
            # Full volume over the hair; tucked in round the neck below.
            k = scale if el >= -8 else 1.06 + (scale - 1.06) * (1 - (-8 - el) / 52)
            p = f.c + Vector((n.x * f.rw, n.y * f.rd, n.z * f.rh)) * k
            if el < -8:
                p.y += (-8 - el) / 52 * 0.12 * f.H  # drapes back onto the nape
            verts[(az, el)] = bm.verts.new(p)
    for i, az in enumerate(azs):
        az2 = azs[(i + 1) % len(azs)]
        for el, el2 in zip(els, els[1:]):
            q = [verts.get((az, el)), verts.get((az2, el)), verts.get((az2, el2)), verts.get((az, el2))]
            if all(q):
                bm.faces.new(q)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Normals out, away from the head.
    for face in bm.faces:
        if face.normal.dot(face.calc_center_median() - f.c) < 0:
            face.normal_flip()
    o = acc._obj(name, bm, mat)
    sol = o.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.03 * f.H
    sol.offset = -1.0
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=sol.name)
    o.data.materials.append(lining)
    for poly in o.data.polygons:
        if poly.normal.dot(poly.center - f.c) < 0:
            poly.material_index = 1
    return o


def cat_ear(name: str, base: Vector, out: Vector, size: float, mat, tip_mat) -> list[bpy.types.Object]:
    """A rounded triangular ear standing out of a hood, its tip another colour."""
    import bmesh

    out = out.normalized()
    side = Vector((0, 1, 0)).cross(out)
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    fwd = out.cross(side).normalized()
    parts = []
    for part, (t0, t1, m) in enumerate(((0.0, 0.62, mat), (0.62, 1.0, tip_mat))):
        bm = bmesh.new()
        rings = []
        for k in range(4):
            t_ = t0 + (t1 - t0) * k / 3
            w = size * 0.55 * (1 - t_) ** 0.9
            d = size * 0.22 * (1 - t_)
            c = base + out * size * t_
            ring = [bm.verts.new(c + side * w * math.cos(a) + fwd * d * math.sin(a)) for a in [i * math.pi / 4 for i in range(8)]]
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for i in range(8):
                bm.faces.new((r0[i], r0[(i + 1) % 8], r1[(i + 1) % 8], r1[i]))
        bm.faces.new(rings[-1])
        bm.faces.new(list(reversed(rings[0])))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        parts.append(acc._obj(f"{name}_{part}", bm, m))
    return parts


def emilia_classic():
    """Emilia's classic look, per the reference: purple detached sleeves with
    a gold emblem, a white corset bodice, a scalloped layered skirt,
    thigh-high boots, a green gem at her breast, thin braids crowning her
    head, and a white lily with a ribbon."""
    spec = R.emilia()
    spec.id = "emilia_classic"
    spec.head.elf_ear = 1.7
    spec.palette.update({
        "ribbon": ("#7a58c2", "cloth"),
        "gold": ("#dbb75c", "metal"),
        "sole": ("#7a58c2", "cloth"),
        "flower_c": ("#c7b2ee", "cloth"),
        "gem": ("#3fbf7a", "metal"),
        "sleeve": ("#8b6fc4", "cloth"),
    })
    base_g = spec.garments
    # Thigh-high boots.
    boots_top = lambda c: c.j.knee_l.z + 0.13 * c.H  # noqa: E731
    spec.zones = R.skin_rules(lambda c: (not c.on_arm()) and boots_top(c) < c.p.z < c.j.hip_l.z - 0.02 * c.H) + [
        ("boot_trim", lambda c: (not c.on_arm()) and boots_top(c) - 0.02 * c.H < c.p.z <= boots_top(c)),
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= boots_top(c)),
        ("skin", lambda c: c.on_arm() and c.arm_s() < 0.3 * c.arm_len()),
        ("dress", lambda c: True),
    ]

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        # Detached purple sleeves from above the elbow, belling at the wrist.
        sl = sleeves("emilia_sleeves", j, m["dress"], start=0.11, bell=0.05)
        sl.data.materials.append(m["sleeve"])
        for poly in sl.data.polygons:
            c = poly.center
            side = 1 if c.x > 0 else -1
            a, w, d = arm_axis(j, side)
            axis_pt = a + d * (c - a).dot(d)
            if poly.normal.dot(c - axis_pt) < 0:
                poly.material_index = 1
        g.objects.append(sl)
        for s_ in (1, -1):
            a, w, d = arm_axis(j, s_)
            top = t.frill_ring(f"emilia_sleevetop{s_}", a + (w - a) * 0.3, -d, 0.03 * H, 0.012 * H, m["dress"], waves=12, flare=0.25)
            t.skin_like_body(top, j)
            g.objects.append(top)
            cf = t.ring_trim(f"emilia_cuff{s_}", j, w - d * 0.022 * H, d, 0.018, m["dress"], lift=0.02)
            if cf:
                g.objects.append(cf)
        # The green gem at her breast, in a gold setting.
        p, n = chest_point(j, j.neck_base.z - 0.045 * H, lift=0.024)
        setting = t.studs("emilia_gem_setting", j, [(Vector((0, -1.0, j.neck_base.z - 0.045 * H)), Vector((0, 1, 0)))], 0.012, m["gold"], lift=0.014, flat=0.3)
        if setting:
            g.objects.append(setting)
        import bmesh

        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.008 * H)
        gem = acc._obj("emilia_gem", bm, m["gem"], smooth=False)
        gem.data.transform(Matrix.Translation(p + n * 0.004 * H) @ Matrix.Diagonal((1.0, 0.55, 1.25, 1.0)))
        gem["bone"] = "upperChest"
        g.objects.append(gem)
        shoes(g, "emilia", j, m["boot"], m["sole"], length=1.12, width=0.92, height=0.95, sole=0.016, collar=0.085)
        return g

    def accessories(j: Joints, m: dict, head):
        out = []
        f = HeadFrame(j, 0.84, 0.94)
        for side, az, el, r in ((1, 66, 40, 0.032), (-1, -70, 34, 0.022)):
            p = f.surface(az, el, 0.085)
            out.append(acc.flower(f"emilia_flower{side}", p, (p - f.c).normalized(), r, 6, m["flower"], m["flower_c"], cup=0.45))
        rb = t.bow("emilia_lily_ribbon", f.surface(66, 30, 0.08), (f.surface(66, 30, 0.08) - f.c).normalized(), 0.016 * j.H, m["ribbon"], tails=1.0, droop=0.25)
        out.append(rb)
        # A thin braided crown: from in front of each ear back round the crown.
        for s_ in (1, -1):
            pts = [f.surface(s_ * az, 46 - 0.06 * abs(az - 75), 0.07) for az in range(75, 181, 15)]
            out.append(acc.braid(f"emilia_crown{s_}", pts, 0.02, m["hair"]))
        return out

    spec.garments = garments
    spec.accessories = accessories
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


def emilia():
    """Emilia in Arc 6, per the reference: a long white hooded cloak — the
    hood worn down, with purple-tipped cat ears — over a fitted purple
    bodysuit, white boots, and her silver hair in one long braid."""
    spec = R.emilia()
    spec.head.elf_ear = 1.7
    from outfit import cape

    # Hair: fringe and side locks as ever; the back gathered into a braid.
    clumps = [c for c in spec.hair.clumps if not (c.chain or "").startswith("hair_back")]
    for k in range(4):
        clumps.append(Clump(az=180 + (k - 1.5) * 8, el=-4, direction=(0.0, 0.25, -1.0), length=3.3, width=0.2, thickness=0.09, stiffness=0.35, gravity=1.4, lift=0.012, chain="hair_braid"))
    for az in range(120, 241, 20):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=24, direction=(math.sin(a) * 0.2, 0.55, -0.85), length=0.7, width=0.42, thickness=0.09, stiffness=0.4, gravity=1.0, lift=0.01))
    chains = {k: v for k, v in spec.hair.chains.items() if not k.startswith("hair_back")}
    chains["hair_braid"] = 6
    spec.hair.clumps = clumps
    spec.hair.chains = chains

    spec.palette.update({
        "suit": ("#6f55b8", "cloth"),
        "cloak": ("#ffffff", "cloth"),
        "lining": ("#c4b2ea", "cloth"),
        "ear_tip": ("#7552c4", "cloth"),
        # A touch more silver-lavender, so the white hood reads against it.
        "hair": ("#d9d4ea", "hair"),
        "cuff": ("#f2a7b4", "cloth"),
        "gold": ("#dbb75c", "metal"),
        "sole": ("#7a58c2", "cloth"),
        "flower_c": ("#c7b2ee", "cloth"),
        "ribbon": ("#7a58c2", "cloth"),
    })
    boots_top = lambda c: c.j.knee_l.z + 0.05 * c.H  # noqa: E731
    spec.zones = R.skin_rules() + [
        ("boot_trim", lambda c: (not c.on_arm()) and boots_top(c) - 0.018 * c.H < c.p.z <= boots_top(c)),
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= boots_top(c)),
        ("cloak", lambda c: c.on_arm()),
        ("suit", lambda c: True),
    ]
    spec.default_zone = "suit"

    def garments(j: Joints, m: dict) -> Garments:
        g = Garments()
        H = j.H
        # The long cloak: round the shoulders and down past the knees, its
        # inside lined in purple.
        cp, guides = cape("emilia_cloak", j, 0.15, 0.66, m["cloak"], chains=6, bones=4, wrap=228, folds=9, fold_depth=0.026, flare=0.45)
        cp["bone"] = "upperChest"
        cp.data.materials.append(m["lining"])
        for poly in cp.data.polygons:
            c = poly.center
            radial = Vector((c.x, c.y - j.chest.y, 0))
            if radial.length > 1e-6 and poly.normal.dot(radial.normalized()) < -0.15:
                poly.material_index = 1
        g.objects.append(cp)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"cape{i}"] = gl
            names.append(f"cape{i}")
        g.bindings[cp.name] = names
        # A frilled white capelet over the shoulders (the hood rises out of it).
        from outfit import shoulder_collar

        capelet = shoulder_collar("emilia_capelet", j, m["cloak"], outer_x=0.118, outer_front=0.078, outer_back=0.098, frill_waves=22, frill_amp=0.009, flare=0.016, lift=0.004)
        capelet["bone"] = "upperChest"
        g.objects.append(capelet)
        # Puffy white sleeves, gathered at pink cuffs.
        g.objects.append(sleeves("emilia_sleeves", j, m["cloak"], start=0.0, bell=0.011))
        for s_ in (1, -1):
            a, w, d = arm_axis(j, s_)
            cf = t.ring_trim(f"emilia_cuff{s_}", j, w - d * 0.02 * H, d, 0.02, m["cuff"], lift=0.022)
            if cf:
                g.objects.append(cf)
        # A gold clasp at the throat.
        cl = t.studs("emilia_clasp", j, [(Vector((0, -1.0, j.neck_base.z - 0.012 * H)), Vector((0, 1, 0)))], 0.012, m["gold"], lift=0.02, flat=0.35)
        if cl:
            cl["bone"] = "upperChest"
            g.objects.append(cl)
        shoes(g, "emilia", j, m["boot"], m["sole"], length=1.12, width=0.92, height=0.95, sole=0.016, collar=0.085)
        return g

    def accessories(j: Joints, m: dict, head):
        out = []
        f = HeadFrame(j, 0.84, 0.94)
        # The hood, up, with its cat ears.
        out.append(hood_up("emilia_hood", f, m["cloak"], m["lining"]))
        for s_ in (1, -1):
            a, e = math.radians(s_ * 40), math.radians(62)
            n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
            base = f.c + Vector((n.x * f.rw, n.y * f.rd, n.z * f.rh)) * 1.3
            out.extend(cat_ear(f"emilia_ear{s_}", base, (n + Vector((0, 0, 0.8))).normalized(), 0.44 * f.H, m["cloak"], m["ear_tip"]))
        guide = getattr(j, "hair_chains", {}).get("hair_braid")
        if guide and len(guide) >= 3:
            pts = [guide[0].lerp(guide[1], 0.5)] + [q.copy() for q in guide[1:]]
            br = acc.braid("emilia_braid", pts, 0.042 * j.H, m["hair"])
            br["chain"] = "hair_braid"
            out.append(br)
            tie_p = pts[-1] + (pts[-1] - pts[-2]).normalized() * -0.01
            tie = t.bow("emilia_braid_tie", tie_p, Vector((0, 1, 0)), 0.016 * j.H, m["ribbon"], tails=0.7, droop=0.2)
            tie["chain"] = "hair_braid"
            out.append(tie)
        return out

    spec.garments = garments
    spec.accessories = accessories
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


# --------------------------------------------------------------------------- Beatrice


def beatrice():
    spec = R.beatrice()
    spec.palette.update({
        "bow": ("#d24a7c", "cloth"),
        "lace": ("#fff8fb", "cloth"),
        "sole": ("#7c2f52", "cloth"),
    })
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        # Frilled white petticoat filling the overskirt's open front.
        pt, guides = skirt("beatrice_petticoat", j, SkirtSpec(top_z=j.waist.z / H - 0.01, length=0.29, top_rx=0.08, top_ry=0.064, flare=1.85, folds=20, fold_depth=0.12, chain_count=7, chain_bones=3), m["trim"])
        g.objects.append(pt)
        names = [k for k in g.chains if k.startswith("skirt")]
        g.bindings[pt.name] = names
        for tier, (dz, rr) in enumerate(((0.2, 1.6), (0.26, 1.78))):
            fr = t.frill_ring(f"beatrice_tier{tier}", Vector((0, j.waist.y, j.waist.z - dz * H)), Vector((0, 0, -1)), 0.08 * H * rr, 0.035 * H, m["lace"], waves=22, flare=0.35)
            g.objects.append(fr)
            g.bindings[fr.name] = names
        # Wide bell sleeves ending in lace.
        g.objects.append(sleeves("beatrice_sleeves", j, m["dress"], bell=0.03, offset=0.01))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            fr = t.frill_ring(f"beatrice_lace{s}", w - d * 0.012 * H, d, 0.036 * H, 0.03 * H, m["lace"], waves=14, flare=0.4)
            t.skin_like_body(fr, j)
            g.objects.append(fr)
        # The big bow at her chest.
        p, n = chest_point(j, j.chest.z + 0.03 * H, lift=0.03)
        bw = t.bow("beatrice_bow", p, n, 0.06 * H, m["bow"], tails=0.7)
        bw["bone"] = "upperChest"
        g.objects.append(bw)
        # Mary Janes.
        shoes(g, "beatrice", j, m["shoe"], m["sole"], length=1.1, width=1.0, height=0.85, sole=0.014, collar=0.06)
        for side in (1, -1):
            x = j.ankle_l.x * side
            st = t.trim(f"beatrice_strap{side}", j, [(Vector((x + side * 0.03 * H * math.cos(a_), j.ankle_l.y - 0.035 * H + 0.012 * H * math.sin(a_), 0.06 * j.H)), Vector((0, 0, -1))) for a_ in [math.pi * k / 8 for k in range(9)]], 0.008, m["sole"], lift=0.012)
            if st:
                g.objects.append(st)
        return g

    base_a = spec.accessories

    def accessories(j: Joints, m: dict, head):
        f = HeadFrame(j, 0.9, 0.96)
        p = f.surface(-30, 70, 0.24)
        cr = acc.crown("beatrice_crown", p, (p - f.c).normalized(), 0.03 * j.H, m["gold"])
        return [cr]

    spec.garments = garments
    spec.accessories = accessories
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    _ = base_a
    return spec


# --------------------------------------------------------------------------- Julius


def julius():
    """Royal Guard: white coat with gold piping, a double row of gold
    buttons, gold epaulettes and an aiguillette, white gloves, tall black
    boots, the navy cape and his sword."""
    spec = R.julius()
    spec.palette.update({"gold_cord": ("#e2bd62", "metal"), "sole": ("#141317", "cloth"), "lining": ("#5a4b8a", "cloth")})
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        g.objects.append(sleeves("julius_sleeves", j, m["coat"], bell=0.004, offset=0.008, back=0.02))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            cf = t.ring_trim(f"julius_cuff{s}", j, w - d * 0.035 * H, d, 0.026, m["gold"], lift=0.016)
            if cf:
                g.objects.append(cf)
            # Epaulettes: a gold board with a fringe over each shoulder.
            top = a + Vector((0, 0, 0.03 * H)) - d * 0.01 * H
            ep = t.plate(f"julius_epaulette{s}", j, top + Vector((0, 0, 0.3 * H)), Vector((0, 0, -1)), (0.06, 0.045, 0.008), m["gold"], lift=0.02, bevel=0.45)
            if ep:
                g.objects.append(ep)
            fr = t.frill_ring(f"julius_fringe{s}", a + d * 0.01 * H + Vector((0, 0, 0.012 * H)), d, 0.05 * H, 0.025 * H, m["gold_cord"], waves=20, flare=0.15)
            t.skin_like_body(fr, j)
            g.objects.append(fr)
        # Gold buttons, two rows down the chest.
        pts = [(Vector((sx * 0.035 * H, -1.0, j.waist.z + (j.upper_chest.z - j.waist.z) * k / 4)), Vector((0, 1, 0))) for sx in (1, -1) for k in range(5)]
        bt = t.studs("julius_buttons", j, pts, 0.007, m["gold"], lift=0.009)
        if bt:
            g.objects.append(bt)
        # Aiguillette: gold cords looping from the right shoulder across the chest.
        for k, sag in enumerate((0.06, 0.1)):
            path = []
            for i in range(14):
                u = i / 13
                x = -0.11 * H + 0.1 * H * u
                z = j.upper_chest.z + 0.01 * H - sag * H * math.sin(math.pi * u) - 0.02 * H * u
                path.append((Vector((x, -1.0, z)), Vector((0, 1, 0))))
            cord = t.trim(f"julius_cord{k}", j, path, 0.006, m["gold_cord"], lift=0.012, thickness=0.004)
            if cord:
                g.objects.append(cord)
        shoes(g, "julius", j, m["boot"], m["sole"], length=1.25, width=1.02, height=1.1, sole=0.012, collar=0.08)
        for side in (1, -1):
            x = j.ankle_l.x * side
            bc = t.ring_trim(f"julius_bootcuff{side}", j, Vector((x, j.knee_l.y, 0.27 * H)), Vector((0, 0, 1)), 0.022, m["boot"], lift=0.01)
            if bc:
                g.objects.append(bc)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


# --------------------------------------------------------------------------- Ram / Rem


def maid_upgrade(spec, cid: str):
    """The Roswaal mansion uniform: puffed black shoulders over white
    detached sleeves, a black bow at the breast, frilled cuffs, white
    stockings and strapped black shoes."""
    spec.palette.update({"sole": ("#101014", "cloth"), "ribbon": ("#16141b", "cloth")})
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H

        # Puffed short sleeves.
        def puff_keep(c):
            return c.on_arm() and c.arm_s() < 0.32 * c.arm_len()

        def puff_extra(p, n):
            side, s_, length, d, radial = t.arm_frame(j, p)
            u = s_ / length
            return 0.0075 * H * math.sin(math.pi * min(1.0, max(0.0, u / 0.32))) + t.wrinkles(j, p, arm=0.4)

        cuts = []
        for side in (1, -1):
            a, w, d = arm_axis(j, side)
            cuts.append((a + (w - a) * 0.32, d))
        g.objects.append(t.shell(f"{cid}_puffs", j, puff_keep, 0.006, m["black"], cuts=cuts, thickness=0.003, extra=puff_extra, subdivide=1))

        # Detached white sleeves from above the elbow to a frilled cuff.
        def sl_keep(c):
            return c.on_arm() and 0.42 * c.arm_len() < c.arm_s() < c.arm_len() - 0.006 * c.H

        def sl_extra(p, n):
            side, s_, length, d, radial = t.arm_frame(j, p)
            return 0.008 * H * t.smoothstep(length * 0.6, length, s_) + t.wrinkles(j, p, arm=0.6, seed=0.3)

        cuts = wrist_cuts(j, 0.006)
        for side in (1, -1):
            a, w, d = arm_axis(j, side)
            cuts.append((a + (w - a) * 0.42, d))
        g.objects.append(t.shell(f"{cid}_sleeves", j, sl_keep, 0.007, m["white"], cuts=cuts, thickness=0.003, extra=sl_extra, subdivide=1))
        for side in (1, -1):
            a, w, d = arm_axis(j, side)
            top = t.frill_ring(f"{cid}_sleevefrill{side}", a + (w - a) * 0.42, -d, 0.034 * H, 0.016 * H, m["white"], waves=14, flare=0.25)
            t.skin_like_body(top, j)
            g.objects.append(top)
            rb = t.ring_trim(f"{cid}_sleeveband{side}", j, a + (w - a) * 0.47, d, 0.012, m["ribbon"], lift=0.012)
            if rb:
                g.objects.append(rb)
            cf = t.frill_ring(f"{cid}_cufffrill{side}", w - d * 0.01 * H, d, 0.026 * H, 0.02 * H, m["white"], waves=12, flare=0.45)
            t.skin_like_body(cf, j)
            g.objects.append(cf)
        # Black bow at the breast.
        p, n = chest_point(j, j.chest.z + 0.04 * H, lift=0.02)
        bw = t.bow(f"{cid}_bow", p, n, 0.03 * H, m["ribbon"], tails=0.8)
        bw["bone"] = "upperChest"
        g.objects.append(bw)
        shoes(g, cid, j, m["shoe"], m["sole"], length=1.08, width=0.95, height=0.85, sole=0.013, collar=0.06)
        for side in (1, -1):
            x = j.ankle_l.x * side
            st = t.trim(f"{cid}_strap{side}", j, [(Vector((x + side * 0.028 * j.H * math.cos(a_), j.ankle_l.y - 0.03 * j.H + 0.012 * j.H * math.sin(a_), 0.06 * j.H)), Vector((0, 0, -1))) for a_ in [math.pi * k / 8 for k in range(9)]], 0.007, m["shoe"], lift=0.012)
            if st:
                g.objects.append(st)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c)
    return spec


def ram_maid():
    """Ram in the Roswaal mansion uniform (the classic look; an alternate outfit)."""
    spec = maid_upgrade(R.ram(), "ram")
    spec.id = "ram_maid"
    return spec


def ram():
    """Ram's Arc 6 travelling outfit: a mint hooded capelet over a white
    blouse, a brown corset with gold buckles, a mint skirt laced up the front
    over a frilled white petticoat, brown tights, mint lace-up boots with
    bows; her headdress with flowers, and the X clip with a purple ribbon."""
    spec = R.ram()
    from outfit import shoulder_collar

    spec.palette.update({
        "mint": ("#9fd6c2", "cloth"),
        "mint_dark": ("#6fb39c", "cloth"),
        "boot": ("#9fd6c2", "cloth"),
        "lining": ("#d8ccef", "cloth"),
        "white": ("#fbfaf8", "cloth"),
        "corset": ("#5a3a2b", "cloth"),
        "tights": ("#5e4436", "cloth"),
        "gold": ("#d8b45a", "metal"),
        "ribbon": ("#8a62c8", "cloth"),
        "sole": ("#3a2a22", "cloth"),
        "lace": ("#f3ecdf", "cloth"),
        "flower": ("#fbf3f6", "cloth"),
        "flower_c": ("#f2a7bb", "cloth"),
    })
    # Painted zones on the body: blouse above, corset at the waist, tights below.
    spec.zones = R.skin_rules() + [
        ("boot", lambda c: (not c.on_arm()) and c.p.z < c.j.knee_l.z - 0.04 * c.H),
        ("tights", lambda c: (not c.on_arm()) and c.p.z < c.j.hip_l.z - 0.03 * c.H),
        ("white", lambda c: c.on_arm()),
        ("corset", lambda c: c.j.waist.z - 0.05 * c.H < c.p.z < c.j.chest.z - 0.03 * c.H),
        ("white", lambda c: True),
    ]
    spec.default_zone = "white"

    def garments(j: Joints, m: dict) -> Garments:
        g = Garments()
        H = j.H
        # Mint skirt over a frilled white petticoat.
        sk, guides = skirt("ram_skirt", j, SkirtSpec(top_z=j.waist.z / H - 0.005, length=0.215, top_rx=0.08, top_ry=0.064, flare=1.75, folds=12, fold_depth=0.12, chain_count=8, chain_bones=3), m["mint"])
        g.objects.append(sk)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"skirt{i}"] = gl
            names.append(f"skirt{i}")
        g.bindings[sk.name] = names
        frill, _ = skirt("ram_petticoat", j, SkirtSpec(top_z=j.waist.z / H - 0.18, length=0.05, top_rx=0.08 * 1.78, top_ry=0.064 * 1.78, flare=1.15, folds=26, fold_depth=0.28, chain_count=8, chain_bones=3), m["lace"])
        g.objects.append(frill)
        g.bindings[frill.name] = names
        # Laced up the skirt's front: two rows of eyelets and the criss-cross.
        top_z, bot_z = j.waist.z - 0.02 * H, j.waist.z - 0.15 * H
        lace = []
        for k in range(6):
            z = top_z + (bot_z - top_z) * k / 5
            for side in (1, -1):
                lace.append((Vector((side * 0.012 * H, -1.0, z)), Vector((0, 1, 0))))
        ey = t.studs("ram_skirt_eyelets", j, lace, 0.0035, m["gold"], lift=0.03, flat=0.5)
        if ey:
            g.objects.append(ey)
        # Gold buckles across the corset.
        for k, z in enumerate((j.waist.z + 0.005 * H, j.waist.z + 0.04 * H)):
            bk = t.plate(f"ram_buckle{k}", j, Vector((0, -1.0, z)), Vector((0, 1, 0)), (0.026, 0.004, 0.012), m["gold"], lift=0.008)
            if bk:
                bk["bone"] = "spine"
                g.objects.append(bk)
        for side in (1, -1):
            st = t.vertical_trim(f"ram_corset_edge{side}", j, side * 0.05 * H, j.waist.z - 0.05 * H, j.chest.z - 0.035 * H, 0.006, m["gold"], lift=0.006)
            if st:
                g.objects.append(st)
        # Blouse: puffed long sleeves with lace cuffs; a frilled collar.
        g.objects.append(sleeves("ram_sleeves", j, m["white"], bell=0.01))
        for side in (1, -1):
            a, w, d = arm_axis(j, side)
            cf = t.frill_ring(f"ram_cuff{side}", w - d * 0.012 * H, d, 0.026 * H, 0.018 * H, m["lace"], waves=12, flare=0.4)
            t.skin_like_body(cf, j)
            g.objects.append(cf)
        collar = shoulder_collar("ram_collar", j, m["lace"], outer_x=0.082, outer_front=0.05, outer_back=0.058, frill_waves=16, frill_amp=0.006)
        collar["bone"] = "upperChest"
        g.objects.append(collar)
        # The mint capelet: round the shoulders and down to mid-back, open at
        # the front, its hem in soft scallops and its inside lined lavender.
        from outfit import cape

        cap, cguides = cape("ram_capelet", j, 0.13, 0.2, m["mint"], tatters=0.55, chains=6, bones=3, wrap=292, folds=6, fold_depth=0.01, flare=0.55)
        cap["bone"] = "upperChest"
        cap.data.materials.append(m["lining"])
        for poly in cap.data.polygons:
            c = poly.center
            radial = Vector((c.x, c.y - j.chest.y, 0))
            if radial.length > 1e-6 and poly.normal.dot(radial.normalized()) < -0.15:
                poly.material_index = 1
        g.objects.append(cap)
        cnames = []
        for i, gl in enumerate(cguides):
            g.chains[f"cape{i}"] = gl
            cnames.append(f"cape{i}")
        g.bindings[cap.name] = cnames
        hood = t.hood_down("ram_hood", j, m["mint"], m["lining"], size=0.92, over=cap, skin=False)
        hood["bone"] = "upperChest"
        g.objects.append(hood)
        p, n = chest_point(j, j.neck_base.z - 0.028 * H, lift=0.03)
        bw = t.bow("ram_capelet_tie", p, n, 0.02 * H, m["mint_dark"], tails=1.1)
        bw["bone"] = "upperChest"
        g.objects.append(bw)
        # Mint lace-up boots with bows at the top.
        shoes(g, "ram", j, m["boot"], m["sole"], length=1.06, width=0.94, height=0.9, sole=0.013, collar=0.07)
        for side in (1, -1):
            x = j.ankle_l.x * side
            top = j.knee_l.z - 0.05 * H
            pts = []
            for k in range(5):
                z = j.ankle_l.z + 0.02 * H + (top - j.ankle_l.z - 0.03 * H) * k / 4
                for s2 in (1, -1):
                    pts.append((Vector((x + s2 * 0.01 * H, -1.0, z)), Vector((0, 1, 0))))
            ey = t.studs(f"ram_boot_eyelets{side}", j, pts, 0.003, m["gold"], lift=0.006, flat=0.5)
            if ey:
                t.skin_like_body(ey, j)
                g.objects.append(ey)
            hit = t.surface_point(j, Vector((x, -1.0, top - 0.004 * H)), Vector((0, 1, 0)), 0.012 * H)
            if hit:
                bb = t.bow(f"ram_bootbow{side}", hit[0], hit[1], 0.014 * H, m["mint_dark"], tails=0.6, droop=0.2)
                t.skin_like_body(bb, j)
                g.objects.append(bb)
        return g

    def accessories(j: Joints, m: dict, head):
        f = HeadFrame(j, 0.84, 0.94)
        out = [acc.headdress("ram_headdress", f.c, f.rw, f.rh, m["white"])]
        # Little flowers on the headdress band.
        for az, el, r in ((-58, 44, 0.016), (-38, 56, 0.013), (54, 48, 0.014)):
            p = f.surface(az, el, 0.07)
            out.append(acc.flower(f"ram_flower{az}", p, (p - f.c).normalized(), r, 5, m["flower"], m["flower_c"], cup=0.4))
        # The X clip over her (uncovered) right side, with a purple ribbon.
        p = f.surface(-40, 45, 0.05)
        out.append(acc.x_clip("ram_clip", p, (p - f.c).normalized(), 0.05 * j.head_h * 6, m["clip"]))
        rb = t.bow("ram_clip_ribbon", p + (p - f.c).normalized() * 0.006 + Vector((0, 0, -0.018 * j.H)), (p - f.c).normalized(), 0.014 * j.H, m["ribbon"], tails=0.9, droop=0.3)
        out.append(rb)
        return out

    spec.garments = garments
    spec.accessories = accessories
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


def rem():
    return maid_upgrade(R.rem(), "rem")


# --------------------------------------------------------------------------- Meili, Anastasia, Shaula


def meili():
    spec = R.meili()
    spec.palette.update({"ribbon": ("#c23a5a", "cloth"), "sole": ("#24180f", "cloth")})
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        g.objects.append(sleeves("meili_sleeves", j, m["dress"], bell=0.01))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            cf = t.frill_ring(f"meili_cuff{s}", w - d * 0.012 * H, d, 0.03 * H, 0.022 * H, m["trim"], waves=12, flare=0.35)
            t.skin_like_body(cf, j)
            g.objects.append(cf)
        p, n = chest_point(j, j.neck_base.z - 0.04 * H, lift=0.03)
        bw = t.bow("meili_bow", p, n, 0.03 * H, m["ribbon"], tails=0.8)
        bw["bone"] = "upperChest"
        g.objects.append(bw)
        shoes(g, "meili", j, m["boot"], m["sole"], length=1.1, width=1.0, height=1.0, sole=0.014, collar=0.075)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


def anastasia():
    spec = R.anastasia()
    spec.palette.update({"sash": ("#9b83c9", "cloth"), "sole": ("#bfb2d6", "cloth")})
    base_g = spec.garments

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        g.objects.append(sleeves("ana_sleeves", j, m["gown"], bell=0.03, offset=0.01))
        for s in (1, -1):
            a, w, d = arm_axis(j, s)
            cf = t.frill_ring(f"ana_cuff{s}", w - d * 0.006 * H, d, 0.04 * H, 0.025 * H, m["trim"], waves=14, flare=0.35)
            t.skin_like_body(cf, j)
            g.objects.append(cf)
        sh = t.ring_trim("ana_sash", j, Vector((0, j.waist.y, j.waist.z + 0.005 * H)), Vector((0, 0, 1)), 0.035, m["sash"], lift=0.012)
        if sh:
            g.objects.append(sh)
        hit = t.front_point(j, 0.0, j.waist.z, 0.03 * H, side=1.0)
        if hit:
            bw = t.bow("ana_bow", hit[0], hit[1], 0.05 * H, m["sash"], tails=1.3)
            bw["bone"] = "spine"
            g.objects.append(bw)
        shoes(g, "ana", j, m["shoe"], m["sole"], length=1.06, width=0.92, height=0.85, sole=0.013, collar=0.06)
        return g

    spec.garments = garments
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c)
    return spec


def star_shape(name: str, centre: Vector, normal: Vector, radius: float, mat, depth: float = 0.25, points: int = 5) -> bpy.types.Object:
    """A small five-pointed star, puffed out along its normal (beads, badges)."""
    import bmesh

    n = normal.normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((0, 1, 0))
    a = (up - n * up.dot(n)).normalized()
    b = n.cross(a)
    bm = bmesh.new()
    rim = []
    for i in range(points * 2):
        ang = math.pi / 2 + i * math.pi / points
        r = radius if i % 2 == 0 else radius * 0.45
        rim.append(bm.verts.new(centre + (a * math.cos(ang) + b * math.sin(ang)) * r))
    front = bm.verts.new(centre + n * radius * depth)
    back = bm.verts.new(centre - n * radius * depth)
    for i in range(len(rim)):
        bm.faces.new((front, rim[i], rim[(i + 1) % len(rim)]))
        bm.faces.new((back, rim[(i + 1) % len(rim)], rim[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return acc._obj(name, bm, mat, smooth=False)


def shaula():
    """Shaula per her reference: reddish-brown hair in a high braided
    ponytail that curls up at the end like a scorpion's stinger, tipped
    with a gold star bead; a black-and-orange bow; black bikini top tied at
    the front; a star-bead necklace; black shorts with an orange belt; a
    black cape lined in orange with ragged edges; black boots with orange
    cuffs and little stars."""
    spec = R.shaula()
    spec.palette.update({
        "hair": ("#6a3226", "hair"),
        "sole": ("#0f0d10", "cloth"),
        "tie": ("#e67a2e", "cloth"),
        "gold": ("#e8c45c", "metal"),
        "cord": ("#1a1418", "cloth"),
    })
    base_g = spec.garments
    # Clean garment pieces instead of painted zones: skin everywhere but the boots.
    spec.zones = [
        ("skin", lambda c: R.is_skin_neck(c) or R.is_hand(c)),
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= 0.27 * c.H),
        ("skin", lambda c: True),
    ]
    spec.cuts = lambda j: [(Vector((0, 0, 0.27 * j.H)), Vector((0, 0, 1)))]

    def garments(j: Joints, m: dict) -> Garments:
        g = base_g(j, m)
        H = j.H
        # The cape's inner face is lined in orange.
        for o in g.objects:
            if o.name.startswith("shaula_cloak"):
                o.data.materials.append(m["orange"])
                for poly in o.data.polygons:
                    c = poly.center
                    radial = Vector((c.x, c.y - j.chest.y, 0))
                    if radial.length > 1e-6 and poly.normal.dot(radial.normalized()) < -0.15:
                        poly.material_index = len(o.data.materials) - 1
        z0, z1 = j.chest.z - 0.035 * H, j.upper_chest.z + 0.004 * H
        g.objects.append(t.shell("shaula_top", j, lambda c: (not c.on_arm()) and z0 < c.p.z < z1 and abs(c.p.x) < 0.11 * H, 0.004, m["black"], cuts=[(Vector((0, 0, z0)), Vector((0, 0, 1))), (Vector((0, 0, z1)), Vector((0, 0, 1)))], thickness=0.003, subdivide=1))
        # The top ties at the front, between the cups.
        p, n = chest_point(j, (z0 + z1) / 2, lift=0.012)
        tie = t.bow("shaula_top_tie", p, n, 0.018 * H, m["black"], tails=0.7, droop=0.2)
        tie["bone"] = "upperChest"
        g.objects.append(tie)
        s0, s1 = j.hip_l.z - 0.075 * H, j.waist.z - 0.03 * H
        g.objects.append(t.shell("shaula_shorts", j, lambda c: (not c.on_arm()) and s0 < c.p.z < s1, 0.005, m["black"], cuts=[(Vector((0, 0, s0)), Vector((0, 0, 1))), (Vector((0, 0, s1)), Vector((0, 0, 1)))], thickness=0.003, extra=lambda p, n: t.wrinkles(j, p, leg=0.5), subdivide=1))
        belt = t.ring_trim("shaula_belt", j, Vector((0, j.waist.y, s1 - 0.004 * H)), Vector((0, 0, 1)), 0.022, m["orange"], lift=0.009)
        if belt:
            g.objects.append(belt)
        # A star-bead necklace: a dark cord round the neck, a gold star at the throat.
        cord = t.ring_trim("shaula_cord", j, Vector((0, j.neck_base.y, j.neck_base.z + 0.006 * H)), Vector((0, 0.35, 1)).normalized(), 0.004, m["cord"], lift=0.004)
        if cord:
            cord["bone"] = "upperChest"
            g.objects.append(cord)
        pn = chest_point(j, j.neck_base.z - 0.022 * H, lift=0.01)
        bead = star_shape("shaula_star_bead", pn[0], pn[1], 0.011 * H, m["gold"], depth=0.35)
        bead["bone"] = "upperChest"
        g.objects.append(bead)
        shoes(g, "shaula", j, m["boot"], m["sole"], length=1.15, width=0.95, height=1.1, sole=0.014, collar=0.085)
        for side in (1, -1):
            x = j.ankle_l.x * side
            bc = t.ring_trim(f"shaula_bootcuff{side}", j, Vector((x, j.knee_l.y, 0.268 * j.H)), Vector((0, 0, 1)), 0.02, m["orange"], lift=0.012)
            if bc:
                g.objects.append(bc)
            # A little star on the front of each cuff.
            hit = t.surface_point(j, Vector((x, j.knee_l.y - 0.2 * H, 0.255 * H)), Vector((0, 1, 0)), 0.016 * H)
            if hit:
                st = star_shape(f"shaula_bootstar{side}", hit[0], hit[1], 0.012 * H, m["gold"], depth=0.3)
                t.skin_like_body(st, j)
                g.objects.append(st)
        return g

    def accessories(j: Joints, m: dict, head):
        out = []
        guide = getattr(j, "hair_chains", {}).get("hair_tail")
        if not guide or len(guide) < 3:
            return out
        H = j.H
        # The braid follows the ponytail's chain from just below the tie...
        pts = [guide[0].lerp(guide[1], 0.6)] + [p.copy() for p in guide[1:]]
        # ...and curls up at the end like a scorpion's stinger.
        d = (pts[-1] - pts[-2]).normalized()
        seg = (pts[-1] - pts[-2]).length * 0.55
        back = Vector((0, 1, 0))
        axis = d.cross(back).normalized() if d.cross(back).length > 1e-3 else Vector((1, 0, 0))
        from mathutils import Matrix

        for _ in range(3):
            d = (Matrix.Rotation(-0.62, 3, axis) @ d).normalized()
            pts.append(pts[-1] + d * seg)
        br = acc.braid("shaula_braid", pts, 0.034 * H, m["hair"])
        br["chain"] = "hair_tail"
        out.append(br)
        # The stinger's point, and the gold star bead that tips it.
        import bmesh

        tip = pts[-1] + d * seg * 0.35
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.016 * H, radius2=0.0, depth=0.06 * H)
        sting = acc._obj("shaula_sting", bm, m["hair"])
        q = Vector((0, 0, 1)).rotation_difference(d)
        sting.data.transform(Matrix.Translation(tip) @ q.to_matrix().to_4x4())
        sting["chain"] = "hair_tail"
        out.append(sting)
        star = star_shape("shaula_tailstar", pts[-1] - d * seg * 0.1, axis, 0.022 * H, m["gold"], depth=0.4)
        star["chain"] = "hair_tail"
        out.append(star)
        # A black-and-orange bow where the ponytail is tied.
        tie_at = guide[0].lerp(guide[1], 0.25)
        bw = t.bow("shaula_hairbow", tie_at + Vector((0, 0.012 * H, 0)), Vector((0, 1, 0.3)).normalized(), 0.04 * H, m["black"], knot_mat=m["orange"], tails=0.8, droop=0.3)
        out.append(bw)
        return out

    spec.garments = garments
    spec.accessories = accessories
    spec.hidden = lambda c: under_shoes(c)
    return spec


UPGRADES = {
    "emilia": emilia,
    "emilia_classic": emilia_classic,
    "beatrice": beatrice,
    "julius": julius,
    "ram": ram,
    "ram_maid": ram_maid,
    "rem": rem,
    "meili": meili,
    "anastasia": anastasia,
    "shaula": shaula,
}

"""Emilia in Arc 6 — a complete base character, with the cloak and hood as
modular parts the game shows and hides (per the Arc 6 references: cloak on
with the hood up, cloak on with the hood down, and the cloak taken off).

Base (always present):
  a fitted purple bodysuit (bare shoulders, a seam down the front) over
  her figure; the white chest covering — cloth draped over the bust from a
  high white collar, its halves meeting in a curved seam, lifted by the
  bust so its scalloped hem hangs a little free, the purple showing in the
  arched opening below the bust; a compact gold-and-purple neck ornament
  (a gold crown bar over a purple crescent, a gold diamond beneath);
  detached puffy white sleeves gathered at pink cuffs; white boots with a
  purple V at the top; long, loose silver hair with straight bangs,
  face-framing strands and pointed elf ears.

Parts (`<id>_part_<name>` meshes, see src/data/characters.ts `looks`):
  cloak      the long white cloak lined lavender, the soft scalloped capelet
             over the shoulders and the round gold clasp at the throat;
  hoodup     the hood worn up, with purple-tipped cat ears;
  hooddown   the hood down, bunched behind the neck and lying on the
             shoulders, its ears flopped back;
  hairback   the long back hair (it goes inside the hood when that's up);
  ornaments  the crown braid, the white flower, the coiled bun and its long
             purple ribbons (under the hood when that's up).
"""
from __future__ import annotations

import math
import os

import bmesh
import bpy  # noqa: F401
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

import accessories as acc
import roster as R
import tailor as t
from hair import Clump, HeadFrame
from humanoid import Joints
from outfit import Garments, ZoneContext, cape
from party import arm_axis, cat_ear, hood_up, shoes, under_shoes, wrist_cuts

# Where the detached sleeves start, along the arm from the shoulder joint (fraction of H).
SLEEVE_START = 0.058
# Her frame (BodySpec multipliers): the ribcage and shoulders set how far
# out the torso's sides are, which the fitting below must know.
BODY_CHEST = 1.27
BODY_SHOULDER = 1.03
# Beyond this |x| (fraction of H) a ray from the torso's centre has hit the
# arm, not the torso; and the A-pose web under the shoulder starts here.
ARM_X = 0.08 * BODY_CHEST / 1.15
ARMPIT_X = 0.076 * BODY_CHEST / 1.15
# Below the armpit the bust's outer side reaches further out than that, and
# the arm is well clear of it.
ARM_X_LOW = 0.105


def arm_x(z: float) -> float:
    """The |x| limit (fraction of H) beyond which a ray has hit the arm, at
    height z (fraction of H)."""
    return ARM_X + (ARM_X_LOW - ARM_X) * (1 - t.smoothstep(0.735, 0.752, z))
# The chest covering is laid out on an unrolled cylinder round the torso:
# (s, z) where z is height and s is distance round from the front centre
# (both fractions of H); s = WRAP_R * angle, so s = 0.078 is the side seam.
WRAP_R = 0.05
COLLAR_Z = 0.829
# Its top edge (the halter line): from the base of the collar down across
# the bare shoulders to just under the armpit.
HALTER = ((0.032, 0.826), (0.08, 0.729))
# The halter line curves in a little (as drawn), so the white narrows towards
# the neck and each side follows the upper torso rather than tenting from it.
HALTER_BOW = -0.004
# Where the two halves of the covering meet over the centre (the top of the
# opening between them, at mid-bust).
APEX = 0.741
# The curved overlap seam runs from just under the ornament down to APEX.
SEAM_TOP = 0.802
# How gently the cloth comes back in below the bust's fullest point (the
# lower, the more the bust lifts it off the underbust).
LIFT = 0.6
# Below this height (the bust's fullest) the bust carries the cloth.
LIFT_FROM = 0.722
# Each half is held up by the upper, outer bust and hovers in front of the
# rest of the breast like a soft shell, up to this far off it (fraction of
# H), most over the lower, inner front, where the scallops hang.
HOVER = 0.007
# Round the back it is a band: its top edge rises from under the arms to
# this height across the shoulder blades, and it closes in a seam at the
# centre back (s = BACK_S).
BACK_TOP = 0.776
BACK_S = WRAP_R * math.pi
# Where the side hem meets the scallops under each breast (angle round the
# breast's centre, see `_outline`), and how deep the scallops are.
LOBE_T0 = -0.3
# The cloud scallops round each breast's hem, from its outer side round
# underneath and up the inner side: (start, end, height), with start/end
# along that arc (0..1) and height relative to its radius. Three broad ones
# and a small one by the opening; the two halves differ a little.
SCALLOPS_R = ((0.0, 0.3, 0.46), (0.3, 0.62, 0.56), (0.62, 0.86, 0.4), (0.86, 1.0, 0.12))
SCALLOPS_L = ((0.0, 0.28, 0.42), (0.28, 0.6, 0.58), (0.6, 0.85, 0.42), (0.85, 1.0, 0.14))
# The hem's soft roll: just inside the scalloped edge the cloth puffs out
# (PUFF, fraction of H, peaking PUFF_W in from the edge) and curls back in.
PUFF = 0.0042
PUFF_W = 0.006


def halter_z(s: float) -> float:
    """Height (fraction of H) of the chest covering's top edge at |s|."""
    (s0, z0), (s1, z1) = HALTER
    s = abs(s)
    if s <= s0:
        return COLLAR_Z
    u = min(1.0, (s - s0) / (s1 - s0))
    return z0 + (z1 - z0) * u + HALTER_BOW * math.sin(math.pi * u)


def top_z(s: float) -> float:
    """Height (fraction of H) of the garment's top edge at |s|, all round:
    the halter line, a rounded armhole under the arm, and the back."""
    s = abs(s)
    s1, z1 = HALTER[1]

    def back(s_: float) -> float:
        return z1 + (BACK_TOP - z1) * t.smoothstep(s1, 0.13, s_)

    w = 0.016
    if s <= s1 - w:
        return halter_z(s)
    if s >= s1 + w:
        return back(s)
    u = (s - (s1 - w)) / (2 * w)
    return (1 - u) ** 2 * halter_z(s1 - w) + 2 * u * (1 - u) * z1 + u * u * back(s1 + w)


def torso_yc(j: Joints, z: float) -> float:
    """y of the torso's centre line at height z (the body's chest is a
    little in front of the spine joints, the neck base a little behind)."""
    zf = z / j.H
    return j.chest.y + (0.0015 + 0.035 * max(0.0, min(0.1, zf - 0.70))) * j.H


def wrap_s(j: Joints, p: Vector) -> float:
    """The unrolled s coordinate of a body point (fraction of H, signed by side)."""
    a = math.atan2(abs(p.x), torso_yc(j, p.z) - p.y)
    return math.copysign(WRAP_R * a, p.x)


# --------------------------------------------------------------------------- the chest covering


def _half(scallops) -> list[tuple[float, float, str]]:
    """One half of the garment's outline (s >= 0), from the top centre round
    to the top of the opening; `scallops` shapes its hem (see SCALLOPS_R)."""
    right: list[tuple[float, float, str]] = []
    (s0, z0), (s1, _z1) = HALTER
    for k in range(6):
        a = k / 5 * math.radians(80)
        right.append((math.sin(a) * s0, COLLAR_Z - (1 - math.cos(a)) * (COLLAR_Z - z0) * 1.4, "top"))
    # Down the shoulder line to under the arm, then round the back.
    for k in range(1, 13):
        s_ = s0 + (s1 - s0) * k / 12
        right.append((s_, top_z(s_), "top"))
    for k in range(1, 15):
        s_ = s1 + (BACK_S - s1) * k / 14
        right.append((s_, top_z(s_), "top"))
    # The breast: centre and radii of the scalloped hem round its underside
    # (broad and not too tall, so the half's fullness sits high).
    cs, cz, rz = 0.043, 0.718, 0.02
    rs_out, rs_in = 0.034, 0.025
    sj, zj = cs + rs_out * math.cos(LOBE_T0), cz + rz * math.sin(LOBE_T0)

    def hem_z(s_: float) -> float:
        u = (s_ - sj) / (BACK_S - sj)
        return zj - 0.003 * abs(math.sin(3 * math.pi * u)) ** 0.55

    # The back seam, then the hem forward round the ribs.
    zb = hem_z(BACK_S)
    for k in range(1, 6):
        right.append((BACK_S, BACK_TOP + (zb - BACK_TOP) * k / 6, "back"))
    for k in range(0, 21):
        s_ = BACK_S + (sj - BACK_S) * k / 20
        right.append((s_, hem_z(s_), "hem"))
    # Under the breast and up its inner side: a few broad, soft cloud
    # scallops, each a rounded arc between two small cusps, drawn rather
    # than repeated (sizes and spacing from the list).
    n = 48
    t0, t1 = LOBE_T0, -math.pi - 0.3
    for k in range(1, n + 1):
        u = k / n
        ang = t0 + (t1 - t0) * u
        h = 0.0
        for u0, u1, amp in scallops:
            if u0 <= u <= u1:
                v = (u - u0) / (u1 - u0)
                h = amp * (1 - (2 * v - 1) ** 2) ** 0.85
                break
        bump = 1 + h
        rs = rs_out if math.cos(ang) > 0 else rs_in
        right.append((cs + rs * bump * math.cos(ang), cz + rz * bump * math.sin(ang), "lobe"))
    # Round the cusps between scallops a little, so the rolled edge can
    # turn them without folding over itself.
    lo = len(right) - n
    for _ in range(3):
        pts_ = right[lo - 1:]
        for k in range(1, len(pts_) - 1):
            (ax, az, _a), (bx, bz, tag), (cx, cz_, _c) = pts_[k - 1], pts_[k], pts_[k + 1]
            right[lo - 1 + k] = (0.25 * ax + 0.5 * bx + 0.25 * cx, 0.25 * az + 0.5 * bz + 0.25 * cz_, tag)
    xs, zs, _ = right[-1]

    def bez(p0, p1, p2, p3, u):
        a, b, c, d = (1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3
        return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])

    # Up into the centre: the opening's rounded top, where the halves part
    # (it narrows smoothly into the point where they meet).
    for k in range(1, 11):
        u = k / 10
        x, z = bez((xs, zs), (xs * 0.82, zs + 0.007), (0.0035, APEX - 0.006), (0.0012, APEX), u)
        right.append((x, z, "notch"))
    return right


def _outline() -> list[tuple[float, float, str]]:
    """Closed outline of the chest garment in (s, z), counter-clockwise seen
    from the front, each point tagged with the edge it belongs to. It is a
    fitted top: from the base of the collar the top edge runs down along
    the bare shoulder line to under the arm and on round the back, where
    the two halves close in a seam; the hem comes forward round the ribs
    and turns into a scalloped edge under each breast, rising into the
    centre, where the halves part in an opening and above which they meet
    in a curved seam. The two halves' scallops differ a little, as drawn
    by hand rather than mirrored."""
    right = _half(SCALLOPS_R)
    left = [(-x, z, tag) for (x, z, tag) in reversed(_half(SCALLOPS_L)[1:])]
    pts = right + left
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if area < 0:
        pts.reverse()
    return pts


def _inside(pts, x, z) -> bool:
    c = False
    n = len(pts)
    for i in range(n):
        x1, z1 = pts[i][0], pts[i][1]
        x2, z2 = pts[(i + 1) % n][0], pts[(i + 1) % n][1]
        if (z1 > z) != (z2 > z) and x < x1 + (z - z1) * (x2 - x1) / (z2 - z1):
            c = not c
    return c


def _edge_dist(pts, x, z) -> float:
    """Distance to the nearest real edge (the back seam is not one)."""
    best = 1e9
    n = len(pts)
    for i in range(n):
        if pts[i][2] == "back" or pts[(i + 1) % n][2] == "back":
            continue
        ax, az = pts[i][0], pts[i][1]
        bx, bz = pts[(i + 1) % n][0], pts[(i + 1) % n][1]
        dx, dz = bx - ax, bz - az
        L = dx * dx + dz * dz
        u = 0.0 if L < 1e-12 else max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L))
        px, pz = ax + dx * u, az + dz * u
        best = min(best, math.hypot(x - px, z - pz))
    return best


def _wrap_point(j: Joints, s: float, z: float):
    """The torso surface at unrolled (s, z) (fractions of H), cast outwards
    from the torso's centre line so it never lands on an arm; returns
    (point, outward horizontal direction)."""
    H = j.H
    a = s / WRAP_R
    d = Vector((math.sin(a), -math.cos(a), 0.0))
    # Under the arm the A-posed body joins torso to arm in a web; a ray
    # through it would land on the arm, so step down until it meets the
    # torso's side and keep that depth.
    def cast(zz: float):
        c = Vector((0.0, torso_yc(j, zz), zz))
        hit = t.surface_point(j, c, d)
        if hit is None or abs(hit[0].x) >= arm_x(zz / H) * H:
            return None
        return hit[0], (hit[0] - c).length

    for k in range(8):
        zz = (z - 0.003 * k) * H
        hit = cast(zz)
        if hit is None:
            continue
        # Near the armpit a ray can still catch the inside of the arm just
        # inside that limit: the torso there narrows going up, so a sudden
        # widening is the arm.
        if z > 0.74 and abs(s) > 0.045:
            below = cast(zz - 0.008 * H)
            if below is not None and hit[1] > below[1] + 0.006 * H:
                continue
        p = hit[0]
        return Vector((p.x, p.y, z * H)), d
    return Vector((0.0, torso_yc(j, z * H), z * H)) + d * 0.05 * H, d


def _triangulate_chest(j: Joints) -> None:
    """Split the body's quads over the chest into triangles before any
    cloth is fitted to it. The bust bends those quads strongly; the fitting
    rays see one diagonal and the exporter may pick the other, which
    pushes the bent half through the thin garment."""
    H = j.H
    bm = bmesh.new()
    bm.from_mesh(j.body.data)
    faces = []
    for f in bm.faces:
        c = f.calc_center_median()
        if len(f.verts) > 3 and c.y < 0.0 and 0.62 * H < c.z < 0.86 * H and abs(c.x) < 0.11 * H:
            faces.append(f)
    bmesh.ops.triangulate(bm, faces=faces, quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(j.body.data)
    bm.free()
    j._base_bvh = None
    j._bvh = None


def _taubin(bm, verts, fixed, iterations: int = 6) -> None:
    """Smooth a patch without shrinking it (Taubin lambda/mu)."""
    nbrs = {v: [e.other_vert(v) for e in v.link_edges] for v in verts}
    for _ in range(iterations):
        for f in (0.5, -0.53):
            moved = {}
            for v in verts:
                if v in fixed or not nbrs[v]:
                    continue
                avg = sum((w.co for w in nbrs[v]), Vector()) / len(nbrs[v])
                moved[v] = v.co + (avg - v.co) * f
            for v, co in moved.items():
                v.co = co


def _drape_field(j: Joints, s_lo: float, s_hi: float, z_lo: float, z_hi: float, step: float, thick: float, k_across: float, k_down: float, k_lift: float | None = None):
    """How far out from the torso's centre line a cloth laid over the chest
    sits, on a grid over the unrolled torso (s, z): it rests on the body
    wherever the body is fullest, can only dip so steeply between two
    rises (it bridges the cleavage), and below a rise it hangs under
    gravity, coming back to the body only gradually (the bust lifts it).
    Returns (s values, z values, R[z][s] in metres)."""
    H = j.H
    ns = int(round((s_hi - s_lo) / step)) + 1
    nz = int(round((z_hi - z_lo) / step)) + 1
    S = [s_lo + i * step for i in range(ns)]
    Z = [z_lo + k * step for k in range(nz)]
    rb = []
    for z in Z:
        cy = torso_yc(j, z * H)
        row = []
        for s_ in S:
            p, _d = _wrap_point(j, s_, z)
            row.append(math.hypot(p.x, p.y - cy))
        rb.append(row)
    # Across the front of the bust only: elsewhere it follows the body.
    dh = step * H * k_across
    front = [i for i, s_ in enumerate(S) if abs(s_) < 0.07]
    for k, z in enumerate(Z):
        # (Below the opening's top each half lies on its own breast.)
        wz = t.smoothstep(APEX - 0.008, APEX + 0.002, z) * (1 - t.smoothstep(0.765, 0.79, z))
        if wz <= 0:
            continue
        row = rb[k]
        env = row[:]
        for a, b in zip(front, front[1:]):
            env[b] = max(env[b], env[a] - dh)
        for a, b in zip(front[::-1], front[::-1][1:]):
            env[b] = max(env[b], env[a] - dh)
        for i in front:
            w = wz * (1 - t.smoothstep(0.05, 0.07, abs(S[i])))
            row[i] = row[i] + (env[i] - row[i]) * w
    # Down: round the sides it's fitted; over the bust (k_lift) the cloth
    # is carried by it, leaving the body below its fullest point and
    # coming back in only gently, so the hem stands off the underbust.
    R = [[0.0] * ns for _ in range(nz)]
    # (Above the bust's fullest point it is fitted too, following the upper
    # chest rather than standing off it like a tent from the neckline.)
    fits = [k_down + 1.4 * t.smoothstep(0.045, 0.07, abs(s_)) for s_ in S]
    wfs = [0.0 if k_lift is None else 1 - t.smoothstep(0.05, 0.068, abs(s_)) for s_ in S]
    for k in range(nz - 1, -1, -1):  # from the collar down
        wl = 1 - t.smoothstep(LIFT_FROM - 0.01, LIFT_FROM + 0.008, Z[k])
        for i in range(ns):
            v = rb[k][i] + thick
            if k < nz - 1:
                w = wfs[i] * wl
                v = max(v, R[k + 1][i] - step * H * ((k_lift or 0.0) * w + fits[i] * (1 - w)))
            R[k][i] = v
    return S, Z, R


def _sample(S, Z, R, s_: float, z: float) -> float:
    """Bilinear lookup in a drape field."""
    step_s = S[1] - S[0]
    step_z = Z[1] - Z[0]
    fi = min(max((s_ - S[0]) / step_s, 0.0), len(S) - 1.001)
    fk = min(max((z - Z[0]) / step_z, 0.0), len(Z) - 1.001)
    i, k = int(fi), int(fk)
    u, w = fi - i, fk - k
    r0 = R[k][i] * (1 - u) + R[k][i + 1] * u
    r1 = R[k + 1][i] * (1 - u) + R[k + 1][i + 1] * u
    return r0 * (1 - w) + r1 * w


def chest_cover(name: str, j: Joints, mat) -> bpy.types.Object:
    """The white chest garment as fitted cloth over her figure: laid on the
    body from the collar down, it hugs the upper chest and the bust (the
    body makes the form; the cloth adds a few millimetres), only softening
    the dip between the breasts where the seam runs, and curves back in to
    the torso under the bust, where its scalloped hem follows the
    underbust. Its outline is laid out on the unrolled torso (see
    `_outline`); finished with a soft rolled edge."""
    H = j.H
    outline = _outline()
    S, Z, R = _drape_field(j, -0.16, 0.16, 0.65, 0.836, 0.002, 0.004 * H, k_across=1.8, k_down=1.3, k_lift=LIFT)
    pts2 = [Vector((x, z)) for x, z, _ in outline]
    step = 0.004
    for xi in range(-39, 40):
        for zi in range(0, 48):
            x, z = xi * step, 0.656 + zi * step
            if _inside(outline, x, z) and _edge_dist(outline, x, z) > step * 0.45:
                pts2.append(Vector((x, z)))
    face = list(range(len(outline)))
    verts2, _edges, tris, orig, *_ = delaunay_2d_cdt(pts2, [], [face], 1, 1e-7)
    out_of = {}
    for k, ins in enumerate(orig):
        for i in ins:
            out_of[i] = k

    def cloth_point(s_: float, z: float) -> tuple[Vector, Vector]:
        a = s_ / WRAP_R
        d = Vector((math.sin(a), -math.cos(a), 0.0))
        c = Vector((0.0, torso_yc(j, z * H), z * H))
        return c + d * _sample(S, Z, R, s_, z), d

    # The hem all round (the scallops under each breast, up into the
    # opening, and on round the ribs): the roll follows it continuously.
    soft_edges = []
    for i in range(len(outline)):
        a_, b_ = outline[i], outline[(i + 1) % len(outline)]
        if a_[2] in ("lobe", "notch", "hem") and b_[2] in ("lobe", "notch", "hem"):
            soft_edges.append((a_[0], a_[1], b_[0], b_[1]))

    def puff(s_: float, z: float) -> float:
        best = 1e9
        for ax, az, bx, bz in soft_edges:
            dx, dz = bx - ax, bz - az
            L = dx * dx + dz * dz
            u = 0.0 if L < 1e-12 else max(0.0, min(1.0, ((s_ - ax) * dx + (z - az) * dz) / L))
            best = min(best, math.hypot(s_ - ax - dx * u, z - az - dz * u))
        x = best / PUFF_W
        return PUFF * H * x * math.exp(1 - x) if x < 6 else 0.0

    def hover(s_: float, z: float) -> float:
        """How far a half stands off its breast: nothing at its supports
        (the upper and outer bust, the top edge), rising across the front
        from the bust's upper slope down past its fullest point, so the
        scalloped hem hangs from a lifted shell."""
        across = 1 - t.smoothstep(0.042, 0.068, abs(s_))
        # Most at the bust's fullest, settling back a little lower down.
        down = t.smoothstep(0.752, 0.72, z) * (1 - 0.4 * t.smoothstep(0.715, 0.69, z))
        return HOVER * H * across * down

    def overlap(s_: float, z: float) -> float:
        """Above the opening one half laps over the other along the curved
        seam: that half sits a little proud, so they read as two pieces."""
        if not APEX < z < SEAM_TOP:
            return 0.0
        u = (SEAM_TOP - z) / (SEAM_TOP - APEX)
        ss = 0.004 * math.sin(2 * math.pi * u) * (0.4 + 0.6 * u)
        fade = t.smoothstep(APEX, APEX + 0.008, z) * (1 - t.smoothstep(SEAM_TOP - 0.01, SEAM_TOP, z))
        return 0.0013 * H * t.smoothstep(-0.0016, 0.0016, ss - s_) * fade

    bm = bmesh.new()
    vs = []
    for v2 in verts2:
        p, d = cloth_point(v2.x, v2.y)
        vs.append(bm.verts.new(p + d * (puff(v2.x, v2.y) + overlap(v2.x, v2.y) + hover(v2.x, v2.y))))
    for tri in tris:
        try:
            bm.faces.new([vs[i] for i in tri])
        except ValueError:
            pass
    ring = [vs[out_of[i]] for i in range(len(outline))]
    _taubin(bm, vs, set(ring), 2)
    # Never inside the body: keep every point at least most of the cloth's
    # thickness off it (smoothing can pull a point in over a curve).
    for v, v2 in zip(vs, verts2):
        p_body, d = _wrap_point(j, v2.x, v2.y)
        cy = torso_yc(j, v.co.z)
        r_body = math.hypot(p_body.x, p_body.y - cy)
        r_v = math.hypot(v.co.x, v.co.y - cy)
        if r_v < r_body + 0.0036 * H:
            k = (r_body + 0.0036 * H) / max(r_v, 1e-6)
            v.co.x *= k
            v.co.y = cy + (v.co.y - cy) * k
    bm.normal_update()
    centre = Vector((0, j.chest.y, 0.72 * H))
    if sum(f.normal.dot(f.calc_center_median() - centre) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    tree = BVHTree.FromBMesh(bm)
    ring_pts = [v.co.copy() for v in ring]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    cloth = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(cloth)
    sol = cloth.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.002 * H
    sol.offset = -1.0
    bpy.context.view_layer.objects.active = cloth
    bpy.ops.object.modifier_apply(modifier=sol.name)
    # The rolled edge all round (two runs, meeting at the back seam), and
    # the seam where the halves overlap in front.
    bm = bmesh.new()
    n = len(outline)
    tags = [tag for _x, _z, tag in outline]
    start = next(i for i in range(n) if tags[i] != "back" and tags[i - 1] == "back")
    runs, cur = [], []
    for k in range(n):
        i = (start + k) % n
        if tags[i] == "back":
            if cur:
                runs.append(cur)
            cur = []
        else:
            cur.append(i)
    if cur:
        runs.append(cur)
    for run in runs:
        ups = [cloth_point(outline[i][0], outline[i][1])[1] for i in run]
        radii = [{"lobe": 0.0042, "hem": 0.0034, "top": 0.0028, "notch": 0.0026}[tags[i]] * H for i in run]
        soft = []
        for a in range(len(run)):
            rr = [radii[min(max(a + k, 0), len(run) - 1)] for k in range(-3, 4)]
            r = sum(rr) / len(rr)
            soft.append((r, r * 0.95))
        t.tube_along(bm, [ring_pts[i] for i in run], soft, ups, ring=10, cap=False)
    # It starts just under the ornament's drop, fine at first.
    seam_pts, seam_ups, seam_r = [], [], []
    for k in range(17):
        u = k / 16
        sz_ = SEAM_TOP + (APEX + 0.001 - SEAM_TOP) * u
        ss_ = 0.004 * math.sin(2 * math.pi * u) * (0.4 + 0.6 * u)
        p, d = cloth_point(ss_, sz_)
        hit = tree.ray_cast(p + d * 0.05 * H, -d)
        if hit[0] is not None:
            seam_pts.append(hit[0] + d * 0.0006 * H)
            seam_ups.append(d)
            w = 0.35 + 0.65 * min(1.0, k / 4)
            seam_r.append((0.0024 * H * w, 0.0016 * H * w))
    if len(seam_pts) > 3:
        t.tube_along(bm, seam_pts, seam_r, seam_ups, ring=8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    edges = acc._obj(name + "_edges", bm, mat)
    for p_ in me.polygons:
        p_.use_smooth = True
    me.materials.append(mat)
    obj = acc.join([cloth, edges], name)
    t.skin_like_body(obj, j)
    return obj


def high_collar(name: str, j: Joints, mat) -> bpy.types.Object:
    """A slim white stand-up collar hugging the neck (per the reference): a
    little higher behind than in front, a small notch where its edges meet
    at the front, a crisp, lightly rolled top edge. Each row is fitted to
    the neck at its own height, so its foot follows the neck's widening
    base down into the chest garment (and no skin shows through it)."""
    H = j.H
    z0 = j.neck_base.z - 0.012 * H
    segs, rows = 48, 8

    def centre_y(zz: float) -> float:
        f = t.front_point(j, 0.0, zz, 0.0)
        b = t.front_point(j, 0.0, zz, 0.0, side=1.0)
        yf = f[0].y if f else j.neck_base.y - 0.04 * H
        yb = b[0].y if b else j.neck_base.y + 0.04 * H
        return (yf + yb) / 2

    heights, radii, centres = [], [], []
    for r in range(rows + 1):
        v = r / rows
        hrow, rrow = [], []
        for i in range(segs):
            a = 2 * math.pi * i / segs  # 0 = front
            back = (1 - math.cos(a)) / 2
            h = (0.021 + 0.006 * back) * H
            notch = 0.006 * H * max(0.0, 1 - abs(math.atan2(math.sin(a), math.cos(a))) / 0.3) ** 1.5
            hrow.append(z0 + v * (h - notch * v))
        zz = sum(hrow) / segs
        cy = centre_y(zz)
        for i in range(segs):
            a = 2 * math.pi * i / segs
            d = Vector((math.sin(a), -math.cos(a), 0.0))
            o = Vector((0.0, cy, hrow[i]))
            hit = t.surface_point(j, o, d)
            rrow.append((hit[0] - o).length if hit else 0.04 * H)
        heights.append(hrow)
        radii.append(rrow)
        centres.append(cy)
    # The top rows hug the neck; lower down the foot may widen with it,
    # but not out over the shoulders.
    for r in range(rows - 1, -1, -1):
        for i in range(segs):
            radii[r][i] = min(radii[r][i], radii[r + 1][i] * 1.12)
    for r in range(rows + 1):
        rr = radii[r]
        radii[r] = [(rr[i - 1] + 2 * rr[i] + rr[(i + 1) % segs]) / 4 for i in range(segs)]
    bm = bmesh.new()
    grid = []
    for r in range(rows + 1):
        v = r / rows
        ease = (0.0016 + 0.0011 * (1 - v) ** 2) * H
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            rad = radii[r][i] + ease
            row.append(bm.verts.new(Vector((math.sin(a) * rad, centres[r] - math.cos(a) * rad, heights[r][i]))))
        grid.append(row)
    top_edge = [vv.co.copy() for vv in grid[-1]]
    for r in range(rows):
        for i in range(segs):
            bm.faces.new((grid[r][i], grid[r][(i + 1) % segs], grid[r + 1][(i + 1) % segs], grid[r + 1][i]))
    bm.normal_update()
    if sum(fc.normal.dot(fc.calc_center_median() - Vector((0, centres[rows // 2], fc.calc_center_median().z))) for fc in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    ups = [Vector((0, 0, 1))] * (len(top_edge) + 1)
    t.tube_along(bm, top_edge + [top_edge[0]], [(0.0012 * H, 0.0011 * H)] * (len(top_edge) + 1), ups, ring=8, cap=False)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.0018 * H
    sol.offset = -1.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    for p_ in me.polygons:
        p_.use_smooth = True
    me.materials.append(mat)
    t.skin_like_body(obj, j)
    return obj


def _plate_from_outline(name: str, outline: list[tuple[float, float]], depth: float, mat, bend: float = 0.0) -> bpy.types.Object:
    """A plate (local X right, Z up, facing -Y) from a 2D outline, given
    depth; `bend` curves it back (y += bend * x^2) to follow a collar."""
    bm = bmesh.new()
    front = [bm.verts.new(Vector((x, 0, z))) for x, z in outline]
    f = bm.faces.new(front)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=Vector((0, depth, 0)))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    if bend:
        for v in bm.verts:
            v.co.y += bend * v.co.x * v.co.x
    return acc._obj(name, bm, mat, smooth=False)


def _place(o: bpy.types.Object, origin: Vector, normal: Vector) -> None:
    """Turn a local plate (facing -Y, Z up) to face `normal` at `origin`."""
    fwd = -normal.normalized()  # local +Y goes into the body
    up = Vector((0, 0, 1))
    # A proper rotation (right x fwd = up): a mirrored basis would turn the
    # plate inside out.
    right = fwd.cross(up).normalized() if abs(fwd.z) < 0.98 else Vector((1, 0, 0))
    up = right.cross(fwd).normalized()
    m = Matrix((right, fwd, up)).transposed().to_4x4()
    o.data.transform(Matrix.Translation(origin) @ m)


def _crescent(w: float, low: float, high: float, horn: float, peak: float, n: int = 14) -> list[tuple[float, float]]:
    """A crowned crescent (local x right, z up): a smile-shaped band whose
    ends sweep up into horns, rising to a crown point at the centre top."""
    pts = []
    for k in range(n + 1):
        u = k / n * 2 - 1
        pts.append((u * w, low + (horn - low) * u * u))
    for k in range(n, -1, -1):
        u = k / n * 2 - 1
        z = high + (horn - high) * abs(u) ** 1.6
        if abs(u) < 0.22:
            z += (0.22 - abs(u)) / 0.22 * peak
        pts.append((u * w * 0.985, z))
    return pts


def _rhombus(w: float, h: float) -> list[tuple[float, float]]:
    return [(0, -h), (w, 0), (0, h), (-w, 0)]


def neck_ornament(j: Joints, gold, purple, rest_on=None) -> list[bpy.types.Object]:
    """The ornament at the base of the collar (per the close-up reference):
    a compact gold crown-shaped bar — level shoulders, a raised point at the
    centre, a round notch under it, its ends dipping — layered over a purple
    crescent that curves up to meet its ends, and a small gold diamond
    hanging beneath. It curves back a little with the collar, and rests on
    the garment and collar (`rest_on`) rather than floating in front."""
    H = j.H
    hit = t.front_point(j, 0.0, j.neck_base.z - 0.011 * H, 0.0)
    if hit is None:
        return []
    p, n = hit
    n = Vector((n.x * 0.2, n.y, n.z * 0.35)).normalized()
    tree = t.bvh_of(rest_on) if rest_on else None

    def seat(q: Vector, depth: float) -> Vector:
        """Where a plate `depth` thick sits with its back on the cloth at q."""
        surf = q + n * 0.0085 * H
        if tree is not None:
            h = tree.ray_cast(q + n * 0.1 * H, -n)
            if h[0] is not None:
                surf = h[0]
        return surf + n * (depth + 0.0003 * H)

    k_ = 1.08  # a little more presence than the earlier compact version
    w = 0.025 * k_
    bend = 0.008 * H / (w * H) ** 2
    out = []
    bar = []
    # Top edge, left to right: the end hooked down round the crescent's
    # horn, a level shoulder, the centre point.
    for x, z in ((-1.0, -0.0078), (-1.02, -0.0042), (-0.94, -0.0004), (-0.8, 0.0014), (-0.5, 0.0021), (-0.22, 0.0025), (-0.09, 0.0034), (0.0, 0.0062), (0.09, 0.0034), (0.22, 0.0025), (0.5, 0.0021), (0.8, 0.0014), (0.94, -0.0004), (1.02, -0.0042), (1.0, -0.0078)):
        bar.append((x * w, z * k_))
    # Bottom edge back, right to left: up the inside of the hooked end, then
    # along under the bar with the round notch under the point.
    for x, z in ((0.9, -0.0062), (0.84, -0.0042), (0.6, -0.0038), (0.2, -0.0038)):
        bar.append((x * w, z * k_))
    for k in range(1, 8):
        a_ = math.pi * k / 8
        bar.append((math.cos(a_) * 0.17 * w, (-0.0038 + math.sin(a_) * 0.0028) * k_))
    for x, z in ((-0.2, -0.0038), (-0.6, -0.0038), (-0.84, -0.0042), (-0.9, -0.0062)):
        bar.append((x * w, z * k_))
    # The purple crescent lies on the cloth; the gold bar is layered over it.
    base = seat(p, 0.0032 * H)
    cres = _plate_from_outline("emilia_neck_crescent", [(x * H, z * H * k_) for x, z in _crescent(w * 0.92, -0.0118, -0.0036, -0.0026, 0.0)], 0.0032 * H, purple, bend=bend)
    _place(cres, base, n)
    out.append(cres)
    gold_bar = _plate_from_outline("emilia_neck_bar", [(x * H, z * H) for x, z in bar], 0.0036 * H, gold, bend=bend)
    _place(gold_bar, base + n * 0.0016 * H, n)
    out.append(gold_bar)
    drop_at = p + Vector((0, 0, -0.0175 * k_ * H))
    drop = _plate_from_outline("emilia_neck_drop", [(x * H, z * H) for x, z in _rhombus(0.0042 * k_, 0.0068 * k_)], 0.003 * H, gold)
    _place(drop, seat(drop_at, 0.003 * H), n)
    out.append(drop)
    for o in out:
        t.skin_like_body(o, j)
    return out


def cloak_clasp(j: Joints, gold, inset) -> list[bpy.types.Object]:
    """The cloak's round gold clasp at the throat, set with purple."""
    H = j.H
    hit = t.front_point(j, 0.0, j.neck_base.z - 0.004 * H, 0.0)
    if hit is None:
        return []
    p, n = hit
    n = Vector((n.x * 0.3, n.y, n.z * 0.3)).normalized()
    out = []
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=0.0125 * H, radius2=0.0115 * H, depth=0.004 * H)
    disc = acc._obj("emilia_clasp", bm, gold)
    disc.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    _place(disc, p + n * 0.026 * H, n)
    out.append(disc)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.0072 * H, radius2=0.0072 * H, depth=0.0045 * H)
    gem = acc._obj("emilia_clasp_inset", bm, inset)
    gem.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    _place(gem, p + n * 0.0278 * H, n)
    out.append(gem)
    for o in out:
        o["bone"] = "upperChest"
        o["part"] = "cloak"
    return out


def puffed_cuff(name: str, j: Joints, centre: Vector, axis: Vector, mat) -> bpy.types.Object:
    """A soft pink cuff where the sleeve gathers at the wrist: a rounded,
    padded band (not a painted ring), skinned like the forearm."""
    H = j.H
    axis = axis.normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    a = axis.cross(ref).normalized()
    b = axis.cross(a).normalized()
    # How thick the wrist is here.
    rs = []
    for k in range(8):
        ang = 2 * math.pi * k / 8
        hit = t.surface_point(j, centre, a * math.cos(ang) + b * math.sin(ang), 0.0)
        if hit:
            rs.append((hit[0] - centre).length)
    r = (sum(rs) / len(rs) if rs else 0.025 * H) + 0.011 * H
    pts, ups = [], []
    for k in range(33):
        ang = 2 * math.pi * k / 32
        radial = a * math.cos(ang) + b * math.sin(ang)
        pts.append(centre + radial * r)
        ups.append(radial)
    bm = bmesh.new()
    t.tube_along(bm, pts, [(0.0125 * H, 0.0085 * H)] * len(pts), ups, ring=12, cap=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = acc._obj(name, bm, mat)
    t.skin_like_body(o, j)
    return o


# --------------------------------------------------------------------------- the cloak's mantle


def capelet(name: str, j: Joints, mat, lining, over=None) -> bpy.types.Object:
    """The cloak's white capelet (per the anime references): from the
    throat it covers the shoulders and falls over the upper arms and the
    upper back, softening and broadening the shoulder line; in front its
    two panels part below the clasp; its hem is cut in soft scallops and
    rolled. It lies on the body and over the long cloak (`over`), lined."""
    from outfit import drape_down

    H = j.H
    tree = t.bvh_of([over]) if over is not None else None
    gap = math.radians(34)  # the opening under the clasp, at the hem
    a0, a1 = gap / 2, 2 * math.pi - gap / 2
    segs, rings = 112, 10
    rx_in, ry_in = 0.044 * H, 0.042 * H
    scallops = 16
    grid = []
    for r in range(rings + 1):
        tr = r / rings
        row = []
        for i in range(segs + 1):
            a = a0 + (a1 - a0) * i / segs  # pi = straight back
            fb = (1 + math.cos(a)) / 2  # 1 at the front
            side = abs(math.sin(a))
            # Reach: to the upper chest in front, over the upper arm at the
            # sides, down the upper back behind; a soft scallop at the hem.
            reach = 0.086 * fb + 0.17 * side * (1 - fb) ** 0.3 + 0.136 * (1 - fb) * (1 - side)
            reach = max(reach, 0.086)
            sc = abs(math.sin(scallops * (a - a0) / 2)) ** 0.55
            reach = reach * (0.94 + 0.08 * sc * min(1.0, tr * 1.3))
            # The front edges run down from the throat (a narrow V).
            end = t.smoothstep(0.0, 0.35, min(a - a0, a1 - a))
            ext = tr * reach * H * (0.55 + 0.45 * end)
            radial = Vector((math.sin(a), -math.cos(a), 0))
            x = radial.x * (rx_in + ext)
            y = j.neck_base.y + radial.y * (ry_in + ext)
            radial_d = math.hypot(x, y - j.neck_base.y)
            slope = 0.65 + 0.55 * (1 - fb)
            cone = j.neck_base.z + 0.004 * H - slope * max(0.0, radial_d - rx_in)
            p = drape_down(j, x, y, 0.009 * H)
            if tree is not None:
                hit = tree.ray_cast(Vector((x, y, j.head_top.z + 0.05 * H)), Vector((0, 0, -1)))
                if hit[0] is not None and (p is None or hit[0].z + 0.006 * H > p.z):
                    p = hit[0] + Vector((0, 0, 0.006 * H))
            if p is None or p.z < cone:
                p = Vector((x, y, cone))
            # Soft fullness: a puffed arch across it, falling away at the hem
            # in gathered folds.
            arch = 0.013 * H * math.sin(math.pi * min(1.0, tr * 1.1)) ** 0.8
            fall = 0.022 * H * t.smoothstep(0.6, 1.0, tr) ** 1.5
            fold = math.sin(scallops * (a - a0)) * 0.0052 * H * tr ** 1.5
            p = p + Vector((0, 0, arch - fall)) + radial * (fold + 0.007 * H * tr * tr)
            row.append(p)
        grid.append(row)
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in grid]
    for r in range(rings):
        for i in range(segs):
            bm.faces.new((vs[r][i], vs[r][i + 1], vs[r + 1][i + 1], vs[r + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.011 * H
    sol.offset = -1.0
    sol.use_rim = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    me.materials.append(mat)
    me.materials.append(lining)
    for poly in me.polygons:
        poly.use_smooth = True
        if poly.normal.z < -0.3:
            poly.material_index = 1
    # The rolled hem along the scalloped edge and up the front edges.
    hem = [grid[r][0] for r in range(2, rings)] + grid[-1] + [grid[r][-1] for r in range(rings - 1, 1, -1)]
    ups = []
    for p in hem:
        q = Vector((p.x, p.y - j.neck_base.y, 0))
        ups.append((q.normalized() if q.length > 1e-6 else Vector((0, 1, 0))) * 0.4 + Vector((0, 0, 1)))
    bm = bmesh.new()
    t.tube_along(bm, [p + Vector((0, 0, -0.004 * H)) for p in hem], [(0.0064 * H, 0.0054 * H)] * len(hem), ups, ring=8)
    hem_o = acc._obj(name + "_hem", bm, mat)
    out = acc.join([obj, hem_o], name)
    t.skin_like_body(out, j)
    return out


# --------------------------------------------------------------------------- hair ornaments


def _resample(points: list[Vector], step: float) -> list[Vector]:
    """Evenly spaced points along a polyline (a smooth Catmull-Rom through it)."""
    dense = []
    n = len(points)
    for i in range(n - 1):
        p0, p1, p2, p3 = points[max(i - 1, 0)], points[i], points[i + 1], points[min(i + 2, n - 1)]
        for k in range(12):
            u = k / 12
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    dense.append(points[-1].copy())
    out = [dense[0]]
    acc_len = 0.0
    for a, b in zip(dense, dense[1:]):
        acc_len += (b - a).length
        if acc_len >= step:
            out.append(b.copy())
            acc_len = 0.0
    return out


def _braid(name: str, points: list[Vector], centre: Vector, width: float, mat) -> bpy.types.Object:
    """A three-strand braid lying on the head: a slim core with pointed,
    leaf-shaped lobes crossing it alternately from each side in a
    herringbone, each bent to the curve of the skull, tapering a little
    towards the end."""
    path = _resample(points, width * 0.34)
    bm = bmesh.new()
    n = len(path)
    # The core, so no gaps show between the lobes.
    core_ups = [(c - centre).normalized() for c in path]
    t.tube_along(bm, path, [(width * 0.24 * (1 - 0.25 * i / max(1, n - 1)), width * 0.2) for i in range(n)], core_ups, ring=8)
    for i, c in enumerate(path):
        tan = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        up = (c - centre).normalized()
        up = (up - tan * up.dot(tan)).normalized()
        side = tan.cross(up).normalized()
        k = 1.0 - 0.28 * i / max(1, n - 1)
        sgn = 1 if i % 2 else -1
        # Each lobe crosses from its side over the middle and down the other.
        axis = (tan * 0.85 + side * (-sgn) * 0.55).normalized()
        L, W, T = 0.74 * width * k, 0.27 * width * k, 0.3 * width * k
        mid = c + side * sgn * 0.05 * width * k + up * T * 0.9
        pts, radii, ups = [], [], []
        for q in range(9):
            tt = q / 8
            along = (tt - 0.5) * L
            # Ends tuck down towards the head.
            p_ = mid + axis * along - up * (4 * (tt - 0.5) ** 2) * T * 1.1
            pts.append(p_)
            prof = math.sin(math.pi * tt) ** 0.7
            radii.append((W * max(prof, 0.05), T * max(prof, 0.08)))
            ups.append(up)
        t.tube_along(bm, pts, radii, ups, ring=8, cap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return acc._obj(name, bm, mat)


def _flower(name: str, position: Vector, normal: Vector, radius: float, mat_petal, mat_centre, petals: int = 5) -> bpy.types.Object:
    """A white flower clip: rounded, slightly cupped petals that overlap at
    their bases, a soft centre."""
    bm = bmesh.new()
    rows, cols = 7, 6
    for i in range(petals):
        a = 2 * math.pi * i / petals
        dirv = Vector((math.cos(a), math.sin(a), 0))
        perp = Vector((-math.sin(a), math.cos(a), 0))
        grid = []
        for r in range(rows + 1):
            t_ = r / rows
            # A rounded petal: narrow at the base, broad and round at the tip.
            half = radius * 0.36 * math.sqrt(max(0.0, 1 - ((t_ - 0.58) / 0.62) ** 2))
            row = []
            for c in range(cols + 1):
                q = (c / cols) * 2 - 1
                pt = dirv * (radius * (0.12 + 0.88 * t_)) + perp * half * q
                # Cupped along and across.
                pt.z = 0.32 * radius * t_ * t_ + 0.1 * radius * q * q * t_ + 0.012 * radius * i
                row.append(bm.verts.new(pt))
            grid.append(row)
        for r in range(rows):
            for c in range(cols):
                bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    petals_o = acc._obj(name, bm, mat_petal)
    sol = petals_o.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = radius * 0.07
    bpy.context.view_layer.objects.active = petals_o
    bpy.ops.object.modifier_apply(modifier=sol.name)
    acc.orient(petals_o, position, normal, spin=0.3)
    bm2 = bmesh.new()
    bmesh.ops.create_uvsphere(bm2, u_segments=12, v_segments=8, radius=1.0)
    for v in bm2.verts:
        v.co = Vector((v.co.x * radius * 0.2, v.co.y * radius * 0.2, v.co.z * radius * 0.12))
    centre = acc._obj(name + "_c", bm2, mat_centre)
    acc.orient(centre, position + normal.normalized() * radius * 0.1, normal)
    return acc.join([petals_o, centre], name)


def _rosette_bun(name: str, centre: Vector, n: Vector, u: Vector, v: Vector, radius: float, mat) -> bpy.types.Object:
    """A styled side bun: a soft knot of hair with broad looped sections
    folded round it like a rosette — each loop a flat lock leaving the
    centre, swinging out and round and tucking back in — slightly uneven
    in size and lean, so it reads as dressed hair, not a machined spiral."""
    bm = bmesh.new()
    geom = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for vv in geom["verts"]:
        x, y, z = vv.co
        vv.co = centre + u * x * radius * 0.62 + v * y * radius * 0.62 + n * (z * radius * 0.5 + radius * 0.16)
    loops = 6
    for k in range(loops):
        a0 = 2 * math.pi * k / loops + 0.25 * math.sin(k * 2.3)
        size = radius * (0.95 + 0.12 * math.sin(k * 1.7))
        # Alternate loops sit higher, overlapping their neighbours.
        rise = radius * (0.14 if k % 2 else 0.0)
        pts, ups, radii = [], [], []
        steps = 18
        for i in range(steps + 1):
            tt = i / steps
            ang = a0 + 1.05 * tt
            r = size * math.sin(math.pi * tt) ** 0.8
            radial = u * math.cos(ang) + v * math.sin(ang)
            # Each loop climbs from the knot's rim and arches over.
            h = rise + radius * (0.3 + 0.32 * math.sin(math.pi * tt)) * (1 - 0.45 * (r / radius))
            pts.append(centre + radial * r + n * h)
            ups.append((n * 1.0 + radial * 0.9 * math.sin(math.pi * tt)).normalized())
            w = radius * 0.36 * (0.55 + 0.45 * math.sin(math.pi * tt))
            radii.append((w, w * 0.4))
        t.tube_along(bm, pts, radii, ups, ring=10, cap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return acc._obj(name, bm, mat)


def _bow_knot(name: str, at: Vector, n: Vector, side: Vector, size: float, mat) -> bpy.types.Object:
    """A small ribbon bow: a knot with two flat loops either side."""
    bm = bmesh.new()
    up = n.cross(side).normalized()
    geom = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    for vv in geom["verts"]:
        x, y, z = vv.co
        vv.co = at + side * x * size * 0.32 + up * y * size * 0.3 + n * z * size * 0.22
    for sgn in (1, -1):
        pts, ups, radii = [], [], []
        for k in range(17):
            a = 2 * math.pi * k / 16
            # A loop out to the side and back, pinched at the knot.
            x = size * 0.95 * (1 - math.cos(a)) / 2
            pts.append(at + side * sgn * (x + size * 0.08) + up * math.sin(a) * size * 0.36 + n * size * 0.05)
            ups.append(n)
            radii.append((size * 0.2, size * 0.05))
        t.tube_along(bm, pts, radii, ups, ring=8, cap=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return acc._obj(name, bm, mat)


# --------------------------------------------------------------------------- spec


def emilia_arc6():
    spec = R.emilia()
    # Her figure carries the chest's shape; the covering is a fitted layer
    # over it (a modest bust: gentle above, rounder below, tucking under).
    spec.body.extra["breasts"] = dict(x=0.052, sink=0.013, z=0.007, ax=0.045, ay=0.046, up=0.055, low=0.036, yaw=0.25, sag=0.18, blend=0.024, fold=0.005)
    # The body below the chest, shaped to match it: a soft waist, a gentle
    # hip flare, a belly with a soft plane change, a small navel, the
    # curve of the lower back.
    spec.body.extra["torso_sculpt"] = dict(waist_in=0.07, hip_out=0.05, hip_dz=0.01, under_ribs=0.002, belly=0.003, navel=0.0022, navel_r=0.0055, navel_dz=-0.014, lumbar=0.006)
    # One even step finer over the whole torso, one more over the bust.
    spec.body.extra["torso_detail"] = 1
    spec.body.extra["chest_detail"] = 2
    # A natural feminine frame rather than a stick: a fuller ribcage, a
    # softly defined waist, hips a little wider than it.
    spec.body.chest = BODY_CHEST
    spec.body.waist = 0.86
    spec.body.hips = 1.44
    spec.body.shoulder = BODY_SHOULDER
    # Fuller thighs and calves under the bodysuit, as drawn.
    spec.body.trouser = 1.16
    spec.head.elf_ear = 1.6
    spec.head.elf_out = 1.0
    # Her ears stand out of her hair — and go under the hood when it's up.
    spec.ear_part = "elfears"

    # ---- Hair: straight, even bangs; long face-framing strands in front
    # of the ears; a smooth crown; long back hair in broad, layered groups.
    spec.head.ear = 1.12
    clumps = []
    # Bangs: a straight fringe made of narrow, soft individual locks, each
    # ending in a gently rounded point; lengths, angles and depths vary a
    # little so they read as locks, not a cut edge or a sawtooth.
    vary = [0.0, 0.022, -0.012, 0.03, -0.006, 0.014, -0.018, 0.026, 0.004, 0.026, -0.018, 0.014, -0.006, 0.03, -0.012, 0.022, 0.0]
    lean = [0.0, -0.04, 0.03, -0.02, 0.04, -0.03, 0.02, -0.04, 0.0, 0.04, -0.02, 0.03, -0.04, 0.02, -0.03, 0.04, 0.0]
    for i, az in enumerate(range(-64, 65, 8)):
        side = math.sin(math.radians(az))
        ln = 0.55 + 0.07 * (abs(az) / 64) ** 2 + vary[i]
        clumps.append(Clump(az=az, el=60, direction=(side * 0.15 + lean[i], -0.75, -0.8), length=ln, width=0.21, thickness=0.045, stiffness=0.3, gravity=1.2, lift=0.008 + (0.006 if i % 2 else 0.0), hold=0.8, tip=1.3, blunt=0.2, twist=0.15 if i % 3 == 1 else (-0.15 if i % 3 == 2 else 0.0)))
    # A couple of thin wisps a little longer than the rest (as drawn).
    for az in (-22, 26):
        side = math.sin(math.radians(az))
        clumps.append(Clump(az=az, el=61, direction=(side * 0.12, -0.75, -0.8), length=0.64, width=0.1, thickness=0.035, stiffness=0.3, gravity=1.2, lift=0.016, hold=0.55, tip=1.3, blunt=0.08))
    # A shorter layer under them, offset between them: the little gaps
    # between the lock tips show hair, not forehead.
    for az in range(-60, 61, 8):
        side = math.sin(math.radians(az))
        clumps.append(Clump(az=az, el=60, direction=(side * 0.15, -0.75, -0.8), length=0.5 + 0.06 * (abs(az) / 64) ** 2, width=0.26, thickness=0.04, stiffness=0.3, gravity=1.2, lift=0.0, hold=0.72, tip=1.5, blunt=0.3))
    for az in (-69, 69):
        clumps.append(Clump(az=az, el=34, direction=(math.copysign(0.16, az), -0.4, -1.0), length=2.1, width=0.3, thickness=0.09, stiffness=0.3, gravity=1.3, lift=0.012, chain=f"hair_side{'L' if az > 0 else 'R'}"))
    for az in (-61, 61):
        clumps.append(Clump(az=az, el=46, direction=(math.copysign(0.1, az), -0.55, -1.0), length=1.15, width=0.26, thickness=0.085, stiffness=0.35, gravity=1.2, lift=0.01))
    # The crown: thin, flat locks lying on the scalp, flowing down from the
    # top of the head (a smooth crown, not tufts).
    for az in range(15, 360, 30):
        if 0 < az < 60:
            continue  # the crown braid lies there, on the scalp
        a = math.radians(az)
        cl = Clump(az=az, el=80, direction=(math.sin(a) * 0.98, -math.cos(a) * 0.98, -0.2), length=0.5, width=0.46, thickness=0.04, stiffness=0.0, gravity=1.4, lift=-0.004, root_offset=0.0, hold=0.7, tip=1.2)
        if 100 < az < 260:
            cl.part = "hairback"
        clumps.append(cl)
    # Behind the crown, a row that carries the top of the head into the
    # back hair without a gap.
    for az in range(104, 257, 22):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=54, direction=(math.sin(a) * 0.4, 0.7, -0.7), length=0.95, width=0.5, thickness=0.09, stiffness=0.2, gravity=1.2, lift=0.006, part="hairback"))

    def chain_of(az: float) -> str:
        return f"hair_back{min(4, max(0, int((az - 108) / 145 * 5)))}"

    # Back hair: a full under-layer, then a few large masses over it at
    # increasing depth — each turned and curved a little differently, their
    # tips at staggered lengths — so the back reads as overlapping groups,
    # not one sheet.
    for k, az in enumerate(range(105, 256, 25)):
        a = math.radians(az)
        centre = abs(az - 180) < 30
        clumps.append(Clump(az=az, el=-10, direction=(math.sin(a) * 0.45, 0.75, -0.7), length=3.3 if centre else 3.0 + 0.08 * (k % 2), width=0.62 if centre else 0.56, thickness=0.1, stiffness=0.32, gravity=1.3, lift=0.004, hold=0.62 if centre else 0.42, chain=chain_of(az), part="hairback"))
    for k, (az, ln) in enumerate(((120, 3.28), (150, 3.42), (180, 3.5), (210, 3.42), (240, 3.28))):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=14, direction=(math.sin(a) * 0.55, 0.75, -0.7), length=ln, width=0.58 if az == 180 else 0.55, thickness=0.1, stiffness=0.32, gravity=1.3, curl=0.08 if k % 2 else -0.08, twist=0.18 if k % 2 else -0.18, lift=0.03, hold=0.6 if az == 180 else 0.45, chain=chain_of(az), part="hairback"))
    for k, (az, ln, curl, lift, spread) in enumerate(((132, 3.55, -0.24, 0.05, 0.75), (164, 3.72, 0.14, 0.078, 0.6), (196, 3.66, -0.14, 0.064, 0.6), (228, 3.55, 0.24, 0.086, 0.75))):
        a = math.radians(az)
        clumps.append(Clump(az=az, el=36, direction=(math.sin(a) * spread, 0.75, -0.7), length=ln, width=0.52, thickness=0.12, stiffness=0.34, gravity=1.3, curl=curl, twist=-curl * 2.0, lift=lift, hold=0.5, chain=chain_of(az), part="hairback"))
    # And one mass down the middle, outermost of all.
    clumps.append(Clump(az=180, el=46, direction=(0.0, 0.8, -0.6), length=3.45, width=0.46, thickness=0.12, stiffness=0.36, gravity=1.3, twist=0.22, lift=0.105, hold=0.52, chain=chain_of(180), part="hairback"))
    spec.hair.clumps = clumps
    spec.hair.chains = {"hair_back0": 5, "hair_back1": 5, "hair_back2": 5, "hair_back3": 5, "hair_back4": 5, "hair_sideL": 4, "hair_sideR": 4}

    spec.palette.update({
        "hair": ("#dedaee", "hair"),
        "suit": ("#7656c0", "cloth"),
        "seam": ("#5a3d9c", "cloth"),
        "chest": ("#fbfbff", "cloth"),
        "sleeve": ("#fbfbff", "cloth"),
        "cuff": ("#f4a9b8", "cloth"),
        "gold": ("#e0bb5e", "metal"),
        "ornament": ("#6a46b6", "cloth"),
        "cloak": ("#ffffff", "cloth"),
        "lining": ("#cbbcec", "cloth"),
        "ear_tip": ("#8a62d4", "cloth"),
        "boot": ("#f7f6fb", "cloth"),
        "boot_trim": ("#8d6ad0", "cloth"),
        "sole": ("#8d6ad0", "cloth"),
        "flower": ("#fdfdff", "cloth"),
        "flower_c": ("#d9cdf5", "cloth"),
        "ribbon": ("#6a45b8", "cloth"),
    })

    def boots_top(c: ZoneContext) -> float:
        return c.j.knee_l.z + 0.05 * c.H

    def on_arm(c: ZoneContext) -> bool:
        """The arm, not the outer side of the bust in front of the chest
        wall (which reaches close to the upper arm)."""
        if not c.on_arm():
            return False
        bust = c.p.y < c.j.chest.y - 0.012 * c.H and abs(c.p.x) < ARM_X_LOW * c.H and 0.67 * c.H < c.p.z < 0.78 * c.H
        return not bust

    def bare_shoulder(c: ZoneContext) -> bool:
        if on_arm(c):
            return c.arm_s() < (SLEEVE_START + 0.012) * c.H
        # The A-pose web joining torso to arm under the shoulder is armpit.
        s = abs(wrap_s(c.j, c.p))
        # (Only the web itself, beside and behind the chest wall, not the
        # outer side of the bust in front of it.)
        if abs(c.p.x) > ARMPIT_X * c.H and s > 0.074 and c.p.y > c.j.chest.y - 0.012 * c.H and c.p.z > (0.775 if body_only else HALTER[1][1] - 0.012) * c.H:
            return True
        # (The skin runs well under the covering's top edge, so the body's
        # coarse colour boundary never peeks out above it.)
        # (Without the garment the bodysuit carries on over the chest.)
        margin = -0.004 if body_only else 0.013
        if body_only and s > 0.05 and c.p.z < 0.775 * c.H:
            return False
        return s > HALTER[0][0] - 0.008 and c.p.z > (top_z(s) - margin) * c.H

    spec.zones = R.skin_rules(bare_shoulder) + [
        ("boot", lambda c: (not c.on_arm()) and c.p.z <= boots_top(c)),
        ("suit", lambda c: True),
    ]
    # A clean line round the top of the boots (the zone follows the cut).
    spec.cuts = lambda j: [(Vector((0, 0, j.knee_l.z + 0.05 * j.H)), Vector((0, 0, 1)))]
    spec.default_zone = "suit"

    def under_sleeves(c: ZoneContext) -> bool:
        return on_arm(c) and (SLEEVE_START + 0.014) * c.H < c.arm_s() < c.arm_len() - 0.03 * c.H

    chest_outline = _outline()

    def under_chest(c: ZoneContext) -> bool:
        # Body faces well inside the fitted chest garment are never seen
        # (and dropping them stops the body pricking through it as the two
        # deform slightly differently).
        if on_arm(c):
            return False
        s_, z = wrap_s(c.j, c.p), c.p.z / c.H
        # Under the bust the hem stands off the body, so more of it stays.
        margin = 0.011 + 0.014 * (1 - t.smoothstep(0.05, 0.068, abs(s_))) * (1 - t.smoothstep(0.71, 0.73, z))
        return _inside(chest_outline, s_, z) and _edge_dist(chest_outline, s_, z) > margin

    # EMILIA_BODY_ONLY=1 builds her without the chest garment, collar and
    # ornament, to judge the figure on its own.
    body_only = bool(os.environ.get("EMILIA_BODY_ONLY"))
    spec.hidden = lambda c: under_shoes(c) or under_sleeves(c) or (not body_only and under_chest(c))

    def garments(j: Joints, m: dict) -> Garments:
        g = Garments()
        H = j.H
        _triangulate_chest(j)
        # ---- Base outfit: complete without the cloak.
        if not body_only:
            chest = chest_cover("emilia_chest", j, m["chest"])
            collar = high_collar("emilia_collar", j, m["chest"])
            g.objects.extend([chest, collar])
            g.objects.extend(neck_ornament(j, m["gold"], m["ornament"], rest_on=[chest, collar]))
        # Detached sleeves: puffed from the upper arm, gathered at pink cuffs.
        cuts = list(wrist_cuts(j, 0.006))
        for s_ in (1, -1):
            a, w, d = arm_axis(j, s_)
            cuts.append((a + d * SLEEVE_START * H, -d))

        def sleeve_keep(c: ZoneContext) -> bool:
            return on_arm(c) and SLEEVE_START * H < c.arm_s() < c.arm_len() - 0.006 * H

        def sleeve_extra(p, n):
            side, s, length, d, radial = t.arm_frame(j, p)
            u = max(0.0, min(1.0, (s - SLEEVE_START * H) / max(1e-6, length - SLEEVE_START * H)))
            # Puffed, but in proportion to her frame (never wider than it).
            puff = 0.0065 * H * math.sin(math.pi * u) ** 0.8
            bell = 0.0042 * H * t.smoothstep(0.75, 1.0, u)
            return t.wrinkles(j, p, arm=0.9, seed=0.9) + puff + bell

        g.objects.append(t.shell("emilia_sleeves", j, sleeve_keep, 0.0065, m["sleeve"], cuts=cuts, thickness=0.003, extra=sleeve_extra, subdivide=1))
        for s_ in (1, -1):
            a, w, d = arm_axis(j, s_)
            top = t.frill_ring(f"emilia_sleevetop{s_}", a + d * (SLEEVE_START + 0.004) * H, -d, 0.031 * H, 0.011 * H, m["sleeve"], waves=12, flare=0.25)
            t.skin_like_body(top, j)
            g.objects.append(top)
            g.objects.append(puffed_cuff(f"emilia_cuff{s_}", j, w - d * 0.022 * H, d, m["cuff"]))
        # The bodysuit's seam down the front.
        seam = t.vertical_trim("emilia_seam", j, 0.0, j.waist.z - 0.006 * H, 0.694 * H, 0.0028, m["seam"], lift=0.0012)
        if seam:
            g.objects.append(seam)
        shoes(g, "emilia", j, m["boot"], m["sole"], length=1.12, width=0.92, height=0.95, sole=0.016, collar=0.085)
        # The boots' purple trim: round the top, dipping to a V over the knee.
        top = j.knee_l.z + 0.05 * H
        for s_ in (1, -1):
            knee = Vector((j.knee_l.x * s_, j.knee_l.y, j.knee_l.z))
            hip = Vector((j.hip_l.x * s_, j.hip_l.y, j.hip_l.z))
            path = []
            for k in range(48):
                ang = -math.pi + 2 * math.pi * k / 48
                z = top - 0.006 * H - 0.032 * H * max(0.0, 1 - abs(ang) / 0.55)
                ctr = knee.lerp(hip, (z - knee.z) / (hip.z - knee.z))
                path.append((ctr, Vector((math.sin(ang) * s_, -math.cos(ang), 0))))
            vt = t.trim(f"emilia_boot_trim{s_}", j, path, 0.011, m["boot_trim"], lift=0.0055, closed=True)
            if vt:
                g.objects.append(vt)
            # The boot's top: a rolled white lip standing proud of the leg.
            lip_path = []
            for k in range(48):
                ang = -math.pi + 2 * math.pi * k / 48
                z = top - 0.004 * H
                ctr = knee.lerp(hip, (z - knee.z) / (hip.z - knee.z))
                lip_path.append((ctr, Vector((math.sin(ang) * s_, -math.cos(ang), 0))))
            lip = t.trim(f"emilia_boot_lip{s_}", j, lip_path, 0.014, m["boot"], lift=0.004, thickness=0.006, closed=True)
            if lip:
                g.objects.append(lip)

        # ---- Part: the cloak (broad, flaring, lined lavender), the capelet
        # over the shoulders, and the clasp.
        # Worn on the shoulders and wrapping round them, its front edges at
        # her sides (behind the arms from the front), not standing as panels.
        # Its free edges are rolled, so it has the thickness of real cloth.
        edges = {}
        cp, guides = cape("emilia_cloak", j, 0.165, 0.7, m["cloak"], chains=6, bones=4, wrap=212, folds=8, fold_depth=0.036, flare=1.0, fold2=(17, 0.012), hem_curve=0.09, edge_wave=0.03, thickness=0.012, edges_out=edges)
        cp.data.materials.append(m["lining"])
        for poly in cp.data.polygons:
            c = poly.center
            radial = Vector((c.x, c.y - j.chest.y, 0))
            if radial.length > 1e-6 and poly.normal.dot(radial.normalized()) < -0.15:
                poly.material_index = 1
        bm = bmesh.new()
        for key in ("left", "right", "hem"):
            line = _resample(edges[key], 0.012 * H)
            ups = []
            for k_, q in enumerate(line):
                tan = (line[min(k_ + 1, len(line) - 1)] - line[max(k_ - 1, 0)]).normalized()
                out_d = Vector((q.x, q.y - j.chest.y, 0))
                out_d = (out_d - tan * out_d.dot(tan)).normalized() if out_d.length > 1e-6 else Vector((0, 1, 0))
                ups.append(out_d)
            t.tube_along(bm, line, [(0.007 * H, 0.0055 * H)] * len(line), ups, ring=8)
        roll = acc._obj("emilia_cloak_roll", bm, m["cloak"])
        cp = acc.join([cp, roll], "emilia_cloak")
        cp["bone"] = "upperChest"
        cp["part"] = "cloak"
        g.objects.append(cp)
        names = []
        for i, gl in enumerate(guides):
            g.chains[f"cape{i}"] = gl
            names.append(f"cape{i}")
        g.bindings[cp.name] = names
        mantle = capelet("emilia_cloak_capelet", j, m["cloak"], m["lining"], over=cp)
        mantle["bone"] = "upperChest"
        mantle["part"] = "cloak"
        g.objects.append(mantle)
        g.objects.extend(cloak_clasp(j, m["gold"], m["ornament"]))

        # ---- Part: the hood down, bunched behind the neck over the cloak,
        # its ears flopped back.
        hd = t.hood_down("emilia_hood_down", j, m["cloak"], size=1.14, over=[cp, mantle], span=70.0, rim_folds=0.22, soft=True)
        hd["part"] = "hooddown"
        g.objects.append(hd)
        f = HeadFrame(j, 0.84, 0.94)
        for s_ in (1, -1):
            base = Vector((s_ * 0.034 * H, j.neck_base.y + 0.082 * H, j.neck_base.z - 0.022 * H))
            for e in cat_ear(f"emilia_hd_ear{s_}", base, Vector((s_ * 0.45, 0.75, -0.55)), 0.3 * f.H, m["cloak"], m["ear_tip"]):
                e["bone"] = "upperChest"
                e["part"] = "hooddown"
                g.objects.append(e)
        return g

    def accessories(j: Joints, m: dict, head):
        out = []
        f = HeadFrame(j, 0.84, 0.94)
        # ---- Part: the hood up, with its cat ears.
        hood = hood_up("emilia_hood", f, m["cloak"], m["lining"], scale=1.2, opening=(66.0, 40.0), cowl=True, seam_peak=0.04)
        hood["part"] = "hoodup"
        out.append(hood)
        for s_ in (1, -1):
            a, e = math.radians(s_ * 34), math.radians(66)
            n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
            # Rooted in the hood (the base sunk into it), rising out of it.
            base = f.c + Vector((n.x * f.rw, n.y * f.rd, n.z * f.rh)) * 1.07
            for ear in cat_ear(f"emilia_ear{s_}", base, (n + Vector((0, 0, 0.6))).normalized(), 0.45 * f.H, m["cloak"], m["ear_tip"], tip_start=0.5):
                ear["part"] = "hoodup"
                out.append(ear)
        # ---- Part: hair ornaments.
        orn = []
        # Her left: a small braid along the crown, ending at a white flower clip.
        # (sampled densely on the skull at a constant height above it, clear
        # of the bangs' roots, so it follows the head's curve).
        pts = []
        for k in range(17):
            el = 74 - 22 * (k / 16) ** 1.1
            # On the bare scalp at the crown, then up over the bangs' roots.
            pts.append(f.surface(6 + 46 * k / 16, el, 0.03 + 0.04 * t.smoothstep(0.0, 1.0, (74 - el) / 13)))
        orn.append(_braid("emilia_crown_braid", pts, f.c, 0.042, m["hair"]))
        fp = f.surface(56, 48, 0.06)
        orn.append(_flower("emilia_flower", fp, (fp - f.c).normalized(), 0.036, m["flower"], m["flower_c"]))
        # Her right: a smooth, rounded bun, tied with purple at its base,
        # long purple ribbons hanging from a bow under it.
        bc = f.surface(-58, 46, 0.05)
        n = (bc - f.c).normalized()
        u = n.cross(Vector((0, 0, 1))).normalized()
        v = n.cross(u).normalized()
        orn.append(_rosette_bun("emilia_bun", bc, n, u, v, 0.042, m["hair"]))
        tie = []
        for k in range(25):
            ang = k / 24 * 2 * math.pi
            tie.append(bc + (u * math.cos(ang) + v * math.sin(ang)) * 0.0375 + n * 0.007)
        orn.append(t.ribbon("emilia_bun_tie", tie, [n] * len(tie), 0.008, m["ribbon"], thickness=0.0025, closed=True))
        # The bow sits on the tie, at the bottom of the bun, where the ribbons start.
        knot = bc - v * 0.036 + n * 0.012
        if knot.z > bc.z:
            knot = bc + v * 0.036 + n * 0.012
        orn.append(_bow_knot("emilia_bow", knot, n, u, 0.026, m["ribbon"]))
        for o in orn:
            o["part"] = "ornaments"
            out.append(o)
        guide = getattr(j, "hair_chains", {}).get("hair_sideR")
        start = knot - n * 0.002
        for i, (dx, dy, extra, twist) in enumerate(((-0.012, 0.012, 0.09, 0.35), (-0.003, 0.022, 0.14, -0.3))):
            # From the bow they drop a little, then ease into the fall of the
            # hair beside her face (and swing with it).
            ctrl = [start, start + Vector((dx * 0.5, dy * 0.4, -0.028)) - n * 0.004]
            if guide and len(guide) >= 3:
                ctrl += [q + Vector((dx, dy, 0)) for q in guide[2:]]
                tail_dir = (guide[-1] - guide[-2]).normalized()
                ctrl.append(ctrl[-1] + tail_dir * extra)
            else:
                ctrl += [start + Vector((dx, dy, -0.08 * k)) for k in range(1, 6)]
            line = _resample(ctrl, 0.012)
            nrm = []
            for k_, q in enumerate(line):
                out_d = Vector((q.x, q.y - j.neck_base.y, 0))
                out_d = out_d.normalized() if out_d.length > 1e-6 else Vector((-1, 0, 0))
                tan = (line[min(k_ + 1, len(line) - 1)] - line[max(k_ - 1, 0)]).normalized()
                nrm.append(Matrix.Rotation(twist * math.sin(math.pi * k_ / max(1, len(line) - 1)), 3, tan) @ out_d)
            rib = t.ribbon(f"emilia_ribbon{i}", line, nrm, 0.014 if i == 0 else 0.012, m["ribbon"], thickness=0.0025)
            rib["chain"] = "hair_sideR"
            rib["part"] = "ornaments"
            out.append(rib)
        return out

    spec.garments = garments
    spec.accessories = accessories
    return spec

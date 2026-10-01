// World mesh audit for one or more areas:
//
//  * z-fighting: coplanar, same-facing triangles from overlapping geometry
//    (two pieces whose faces share a plane flicker as the camera moves);
//  * walk-through: solid-looking surfaces at body height with no collider
//    behind them (the player walks straight through them);
//  * floaters: collision floors with no visible surface under the feet.
//
//   node tools/browser/meshaudit.mjs [area ...]      (GAME_URL to target a build)
//
// Prints the worst offenders per area with a world position to look at.
import { launch, waitReady, step } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const AREAS = process.argv.slice(2).length ? process.argv.slice(2) : ['tower_foot', 'celaeno', 'alcyone', 'taygeta', 'electra'];

function audit() {
  const g = window.__game;
  const scene = g.render.scene;
  const V = g.player.entity.object3D.position.constructor;
  // Kit batches: audit the full-detail level everywhere.
  scene.traverse((o) => {
    const m = /lod(\d)$/.exec(o.name);
    if (m) o.visible = m[1] === '0';
  });
  scene.updateMatrixWorld(true);

  const meshes = [];
  scene.traverseVisible((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => m.transparent || m.depthWrite === false || m.colorWrite === false)) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos || pos.count < 3) return;
    if (o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere();
    if (o.geometry.boundingSphere.radius > 600) return; // sky domes, sand walls
    meshes.push(o);
  });

  const label = (o, i) => {
    let p = o;
    const names = [];
    while (p && p !== scene && names.length < 3) {
      if (p.name) names.push(p.name);
      p = p.parent;
    }
    return `${names.join(' < ') || o.type}${i >= 0 ? `#${i}` : ''}`;
  };

  // ---- gather world triangles
  const tris = [];
  const a = new V(), b = new V(), c = new V(), e1 = new V(), e2 = new V(), n = new V();
  const M4 = g.render.camera.matrixWorld.constructor;
  const mat = new M4();
  const tmp = new M4();
  for (const o of meshes) {
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    if (triCount > 200000) continue; // terrain: audited by the floor check instead
    const count = o.isInstancedMesh ? o.count : 1;
    const doubleSide = (Array.isArray(o.material) ? o.material : [o.material]).some((m) => m.side === 2);
    for (let inst = 0; inst < count; inst++) {
      if (o.isInstancedMesh) {
        o.getMatrixAt(inst, tmp);
        mat.multiplyMatrices(o.matrixWorld, tmp);
      } else mat.copy(o.matrixWorld);
      const src = `${label(o, o.isInstancedMesh ? inst : -1)}`;
      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(mat);
        b.fromBufferAttribute(pos, i1).applyMatrix4(mat);
        c.fromBufferAttribute(pos, i2).applyMatrix4(mat);
        e1.subVectors(b, a);
        e2.subVectors(c, a);
        n.crossVectors(e1, e2);
        const area = n.length() / 2;
        if (area < 2e-4) continue;
        n.normalize();
        tris.push({ p: [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], n: [n.x, n.y, n.z], d: n.dot(a), src, doubleSide });
      }
    }
  }

  // ---- bucket by plane, then by 2D cell within the plane
  const buckets = new Map();
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    const key = `${Math.round(t.n[0] * 40)},${Math.round(t.n[1] * 40)},${Math.round(t.n[2] * 40)}|${Math.round(t.d / 0.006)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  const basis = (nx, ny, nz) => {
    const ux = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    // u = normalize(ux x n), v = n x u
    let u = [ux[1] * nz - ux[2] * ny, ux[2] * nx - ux[0] * nz, ux[0] * ny - ux[1] * nx];
    const l = Math.hypot(...u);
    u = u.map((x) => x / l);
    const v = [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]];
    return [u, v];
  };
  const clipArea = (P, Q) => {
    // Sutherland–Hodgman: clip polygon P by convex polygon Q (both CCW).
    const area2 = (poly) => {
      let s = 0;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        s += x1 * y2 - x2 * y1;
      }
      return s / 2;
    };
    const ccw = (poly) => (area2(poly) < 0 ? poly.slice().reverse() : poly);
    let out = ccw(P);
    const clip = ccw(Q);
    for (let i = 0; i < clip.length && out.length; i++) {
      const [ax, ay] = clip[i];
      const [bx, by] = clip[(i + 1) % clip.length];
      const inside = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= -1e-9;
      const inter = ([px, py], [qx, qy]) => {
        const a1 = by - ay, b1 = ax - bx, c1 = a1 * ax + b1 * ay;
        const a2 = qy - py, b2 = px - qx, c2 = a2 * px + b2 * py;
        const det = a1 * b2 - a2 * b1;
        if (Math.abs(det) < 1e-12) return [px, py];
        return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
      };
      const input = out;
      out = [];
      for (let k = 0; k < input.length; k++) {
        const cur = input[k];
        const prev = input[(k + input.length - 1) % input.length];
        if (inside(cur)) {
          if (!inside(prev)) out.push(inter(prev, cur));
          out.push(cur);
        } else if (inside(prev)) out.push(inter(prev, cur));
      }
    }
    return out.length >= 3 ? Math.abs(area2(out)) : 0;
  };
  const fights = new Map();
  const CELL = 1.5;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const t0 = tris[list[0]];
    const [u, v] = basis(...t0.n);
    const pts2 = new Map();
    const grid = new Map();
    const big = [];
    for (const i of list) {
      const t = tris[i];
      const q = [];
      for (let k = 0; k < 3; k++) {
        const x = t.p[k * 3], y = t.p[k * 3 + 1], z = t.p[k * 3 + 2];
        q.push([x * u[0] + y * u[1] + z * u[2], x * v[0] + y * v[1] + z * v[2]]);
      }
      pts2.set(i, q);
      const minX = Math.floor(Math.min(q[0][0], q[1][0], q[2][0]) / CELL), maxX = Math.floor(Math.max(q[0][0], q[1][0], q[2][0]) / CELL);
      const minY = Math.floor(Math.min(q[0][1], q[1][1], q[2][1]) / CELL), maxY = Math.floor(Math.max(q[0][1], q[1][1], q[2][1]) / CELL);
      if ((maxX - minX + 1) * (maxY - minY + 1) > 400) {
        big.push(i);
        continue;
      }
      for (let gx = minX; gx <= maxX; gx++)
        for (let gy = minY; gy <= maxY; gy++) {
          const k = `${gx},${gy}`;
          let cell = grid.get(k);
          if (!cell) grid.set(k, (cell = []));
          cell.push(i);
        }
    }
    const tested = new Set();
    const test = (i, j) => {
      if (i === j) return;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (tested.has(key)) return;
      tested.add(key);
      const A = tris[i], B = tris[j];
      if (Math.abs(A.d - B.d) > 0.004) return;
      if (A.n[0] * B.n[0] + A.n[1] * B.n[1] + A.n[2] * B.n[2] < 0.9995) return;
      const area = clipArea(pts2.get(i), pts2.get(j));
      if (area < 0.002) return;
      const pair = A.src < B.src ? `${A.src}  ⟷  ${B.src}` : `${B.src}  ⟷  ${A.src}`;
      // Faces pointing down at ground level are buried bottoms: never seen.
      if (A.n[1] < -0.7 && A.p[1] < 0.3) return;
      const f = fights.get(pair) ?? { area: 0, at: [A.p[0], A.p[1], A.p[2]].map((x) => +x.toFixed(1)), n: A.n.map((x) => +x.toFixed(2)) };
      f.area += area;
      fights.set(pair, f);
    };
    for (const cell of grid.values()) for (let x = 0; x < cell.length; x++) for (let y = x + 1; y < cell.length; y++) test(cell[x], cell[y]);
    for (const i of big) for (const j of list) test(i, j);
  }

  // ---- walk-through: sample surfaces at body height, look for colliders behind them
  const physics = g.physics;
  const ground = (x, y, z) => physics.groundHeight(x, y + 2, z, 8);
  const noCol = new Map();
  const seen = new Map();
  const probe = new V();
  const dir = new V();
  for (const t of tris) {
    // vertical-ish faces only (walls, sides of objects)
    if (Math.abs(t.n[1]) > 0.6) continue;
    const cx = (t.p[0] + t.p[3] + t.p[6]) / 3, cy = (t.p[1] + t.p[4] + t.p[7]) / 3, cz = (t.p[2] + t.p[5] + t.p[8]) / 3;
    const gh = ground(cx + t.n[0] * 0.6, cy, cz + t.n[2] * 0.6);
    if (gh === null) continue;
    const h = cy - gh;
    if (h < 0.35 || h > 1.7) continue;
    const s = seen.get(t.src) ?? { n: 0, miss: 0 };
    if (s.n > 60) continue;
    s.n++;
    // From half a metre in front of the surface, straight in: a collider
    // should stop the ray within 0.6 m behind the visible face (colliders
    // are simplified shapes, a little inside the art).
    probe.set(cx + t.n[0] * 0.5, cy, cz + t.n[2] * 0.5);
    dir.set(-t.n[0], 0, -t.n[2]).normalize();
    const hit = physics.raycast(probe, dir, 1.1, 0xffff);
    if (!hit) {
      s.miss++;
      if (!noCol.has(t.src)) noCol.set(t.src, [cx, cy, cz].map((x) => +x.toFixed(1)));
    }
    seen.set(t.src, s);
  }
  const walk = [...seen.entries()].filter(([, s]) => s.n >= 4 && s.miss / s.n > 0.5).map(([src, s]) => ({ src, miss: `${s.miss}/${s.n}`, at: noCol.get(src) }));

  return {
    meshes: meshes.length,
    tris: tris.length,
    fights: [...fights.entries()].sort((x, y) => y[1].area - x[1].area).slice(0, 40).map(([pair, f]) => ({ pair, area: +f.area.toFixed(2), at: f.at, n: f.n })),
    walk: walk.slice(0, 60),
  };
}

const { browser, page, errors } = await launch({ url: `${BASE}?dev=1&area=${AREAS[0]}`, width: 640, height: 360 });
try {
  await waitReady(page);
  for (const area of AREAS) {
    if (area !== AREAS[0]) {
      await page.evaluate((a) => window.__game.scenes.goto(a), area);
      await page.waitForFunction((a) => window.__game.scenes.current?.id === a, area, { timeout: 120000 });
      await step(page, 0.5, false);
    }
    const r = await page.evaluate(audit);
    console.log(`\n=== ${area}: ${r.meshes} meshes, ${r.tris} triangles`);
    console.log(`-- z-fighting (${r.fights.length})`);
    for (const f of r.fights) console.log(`  ${String(f.area).padStart(7)} m²  @${f.at.join(',')}  n=${f.n.join(',')}  ${f.pair}`);
    console.log(`-- walk-through (${r.walk.length})`);
    for (const w of r.walk) console.log(`  ${w.miss.padStart(6)}  @${w.at.join(',')}  ${w.src}`);
  }
  const e = errors.filter((x) => !/favicon/.test(x));
  if (e.length) console.log('errors:', e.slice(0, 3));
} finally {
  await browser.close();
}

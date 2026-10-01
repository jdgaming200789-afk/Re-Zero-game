import type RAPIER from '@dimforge/rapier3d-compat';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import type { KitBatch } from '../kit/KitBatch';
import type { Physics } from '../../physics/Physics';
import { Layer } from '../../physics/Physics';

/**
 * Procedural helpers for the tower's circular floors. Every level of the
 * Pleiades Watchtower is a round hall; these assemble kit pieces around
 * circles and generate the curved elements the kit can't provide
 * (helical stairs, gallery rings, domes).
 *
 * Angles: 0 rad = +Z (toward the gate / south), increasing toward +X.
 */
export function polar(r: number, angle: number, y = 0): Vector3 {
  return new Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
}

export interface RingWallOptions {
  /** Inner face radius. Walls are 4 m wide, so segment count is derived. */
  radius: number;
  baseY: number;
  /** Piece name for each segment index (default Wall_4x6). */
  pieceAt?: (index: number, angle: number) => string | null;
  segments?: number;
}

/** Places 4 m kit walls around a circle, facing inward. Returns segment count. */
export function ringWalls(batch: KitBatch, opts: RingWallOptions): number {
  const n = opts.segments ?? Math.max(8, Math.round((2 * Math.PI * opts.radius) / 4));
  // Chord for 4 m walls: place centre at r*cos(half-angle) so edges meet.
  const half = Math.PI / n;
  const rc = opts.radius / Math.cos(half) + 0.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const piece = opts.pieceAt ? opts.pieceAt(i, a) : 'Wall_4x6';
    if (!piece) continue;
    const p = polar(rc, a, opts.baseY);
    // Kit walls face +Z; turn them to face the centre.
    batch.place(piece, p.x, p.y, p.z, { rotY: a + Math.PI, scale: new Vector3((2 * rc * Math.tan(half)) / 4 + 0.02, 1, 1) });
  }
  return n;
}

/** Ring of columns (optionally with arches between them) at `radius`. */
export function colonnade(batch: KitBatch, radius: number, count: number, baseY: number, arches: boolean, skip: (i: number) => boolean = () => false): void {
  for (let i = 0; i < count; i++) {
    if (skip(i)) continue;
    const a = (i / count) * Math.PI * 2;
    const p = polar(radius, a, baseY);
    batch.place('Column_6', p.x, p.y, p.z, { rotY: a });
    if (arches && !skip((i + 1) % count)) {
      const am = ((i + 0.5) / count) * Math.PI * 2;
      const chord = 2 * radius * Math.sin(Math.PI / count);
      const pm = polar(radius * Math.cos(Math.PI / count), am, baseY + 6);
      batch.place('Arch_4', pm.x, pm.y, pm.z, { rotY: am + Math.PI, scale: new Vector3(chord / 4, 1, 1) });
    }
  }
}

export interface HelixSpec {
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  /** Signed sweep in radians (positive = counter-clockwise seen from above). */
  sweep: number;
  startY: number;
  rise: number;
  steps: number;
}

/**
 * Monumental helical stair: instanced treads, a smooth invisible ramp for
 * movement (steady camera, no step jitter), and a solid stone parapet +
 * stringer band along the open inner edge.
 */
export function helicalStair(batch: KitBatch, physics: Physics, parent: Object3D, spec: HelixSpec, parapetMat: Material): RAPIER.Collider[] {
  const colliders: RAPIER.Collider[] = [];
  const midR = (spec.innerRadius + spec.outerRadius) / 2;
  const stepAngle = spec.sweep / spec.steps;
  const tangential = Math.abs(stepAngle) * midR;
  const width = spec.outerRadius - spec.innerRadius;
  for (let i = 0; i < spec.steps; i++) {
    const a = spec.startAngle + stepAngle * (i + 0.5);
    const y = spec.startY + (spec.rise * (i + 1)) / spec.steps;
    const p = polar(spec.innerRadius - 0.3 * (width / 2.6), a, y);
    // SpiralTread spans local +X (radial). Rotate so +X points outward.
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a - Math.PI / 2);
    batch.place('SpiralTread', p.x, p.y, p.z, { rotation: q, scale: new Vector3(width / 2.6, 1, (tangential / 0.62) * 1.08), collide: false });
  }

  // Ramp ribbon (collision only): a helicoid surface at tread-top height.
  const segs = spec.steps * 2;
  const verts: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const a = spec.startAngle + spec.sweep * t;
    const y = spec.startY + spec.rise * t + 0.02;
    for (const r of [spec.innerRadius - 0.2, spec.outerRadius + 0.2]) {
      const p = polar(r, a, y);
      verts.push(p.x, p.y, p.z);
    }
    if (s > 0) {
      const b = (s - 1) * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  colliders.push(physics.addTrimesh(new Float32Array(verts), new Uint32Array(idx), Layer.Environment, { kind: 'static', surface: 'stone' }));

  // Parapet + stringer: a vertical band along the inner edge from 0.9 m
  // above the treads down to 0.7 m below them.
  const band = helixBand(spec.innerRadius - 0.15, spec, 0.95, -0.75, 0.28);
  const mesh = new Mesh(band, parapetMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  // Parapet collision (keeps you from stepping off the open side).
  const pos = band.getAttribute('position').array as Float32Array;
  colliders.push(physics.addTrimesh(new Float32Array(pos), new Uint32Array(band.index!.array), Layer.Environment, { kind: 'static', surface: 'stone' }));
  return colliders;
}

/** Closed rectangular-section band following a helix (parapets, stringers). */
function helixBand(radius: number, spec: HelixSpec, top: number, bottom: number, thickness: number): BufferGeometry {
  const segs = Math.max(24, Math.round(Math.abs(spec.sweep) * radius * 1.5));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const section = [
    new Vector2(-thickness / 2, bottom),
    new Vector2(thickness / 2, bottom),
    new Vector2(thickness / 2, top),
    new Vector2(-thickness / 2, top),
  ];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const a = spec.startAngle + spec.sweep * t;
    const y = spec.startY + spec.rise * t;
    for (const c of section) {
      const p = polar(radius + c.x, a, y + c.y);
      pos.push(p.x, p.y, p.z);
      uv.push(t * Math.abs(spec.sweep) * radius, y + c.y);
    }
  }
  const ring = section.length;
  for (let s = 0; s < segs; s++) {
    for (let k = 0; k < ring; k++) {
      const a0 = s * ring + k;
      const a1 = s * ring + ((k + 1) % ring);
      const b0 = a0 + ring;
      const b1 = a1 + ring;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  // End caps
  const capEnd = (s: number, flip: boolean) => {
    const o = s * ring;
    if (flip) idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    else idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  };
  capEnd(0, true);
  capEnd(segs, false);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat annular floor (galleries, landings) with trimesh collision. */
export function galleryRing(
  physics: Physics,
  parent: Object3D,
  innerR: number,
  outerR: number,
  y: number,
  topMat: Material,
  edgeMat: Material,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
): RAPIER.Collider[] {
  // Top surface: RingGeometry lies in XY with theta from +X; after rotating
  // onto XZ a ring angle phi maps to our +Z-based angle as phi = angle - PI/2.
  const top = new RingGeometry(innerR, outerR, 96, 1, thetaStart - Math.PI / 2, thetaLength);
  top.rotateX(-Math.PI / 2);
  // World-scale UVs in metres for tiling materials.
  const p = top.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = -p.getZ(i);
  }
  top.setAttribute('uv', new BufferAttribute(uv, 2));
  const topMesh = new Mesh(top, topMat);
  topMesh.position.y = y;
  topMesh.receiveShadow = true;
  parent.add(topMesh);
  // Inner edge fascia (the visible thickness from below).
  const edge = new LatheGeometry([new Vector2(innerR, -0.6), new Vector2(innerR - 0.05, -0.55), new Vector2(innerR - 0.05, -0.02), new Vector2(innerR, 0)], 96);
  const edgeMesh = new Mesh(edge, edgeMat);
  edgeMesh.position.y = y;
  edgeMesh.castShadow = true;
  parent.add(edgeMesh);
  const under = new RingGeometry(innerR, outerR, 96, 1);
  under.rotateX(Math.PI / 2);
  const underMesh = new Mesh(under, edgeMat);
  underMesh.position.y = y - 0.6;
  parent.add(underMesh);

  topMesh.updateMatrixWorld(true);
  const verts = new Float32Array(p.count * 3);
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(topMesh.matrixWorld);
    verts.set([v.x, v.y, v.z], i * 3);
  }
  const indices = new Uint32Array(top.index!.array);
  // Thicken by adding the collider slightly below as well (two-sided safety).
  return [physics.addTrimesh(verts, indices, Layer.Environment, { kind: 'static', surface: 'stone' })];
}

/** Domed ceiling with an oculus (lathe), double-sided. */
export function dome(parent: Object3D, radius: number, springY: number, height: number, oculusR: number, mat: Material): Mesh {
  const pts: Vector2[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = radius * Math.cos((t * Math.PI) / 2);
    if (r < oculusR) {
      pts.push(new Vector2(oculusR, springY + height * Math.sqrt(Math.max(0, 1 - (oculusR / radius) ** 2))));
      break;
    }
    pts.push(new Vector2(r, springY + height * Math.sin((t * Math.PI) / 2)));
  }
  const geo = new LatheGeometry(pts, 96);
  // World-scale UVs
  const p = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    uv.setXY(i, Math.atan2(x, z) * radius * 0.5, p.getY(i));
  }
  const m = new Mesh(geo, mat);
  (m.material as Material).side = DoubleSide;
  m.receiveShadow = true;
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Floor disc from 4×4 kit tiles, clipped to a radius (tiles under the wall are fine). */
export function tiledFloor(batch: KitBatch, radius: number, y: number, piece = 'Floor_4x4'): void {
  const n = Math.ceil(radius / 4) + 1;
  for (let ix = -n; ix < n; ix++) {
    for (let iz = -n; iz < n; iz++) {
      const x = ix * 4 + 2;
      const z = iz * 4 + 2;
      if (Math.hypot(Math.abs(x) - 2, Math.abs(z) - 2) > radius + 1) continue;
      batch.place(piece, x, y, z);
    }
  }
}

/**
 * The stairwell behind a door in the outer ring wall: a shallow stone
 * recess with a few steps climbing (or dropping) into the dark, so the door
 * reads as the way to another floor. An invisible wall at its mouth keeps
 * characters (and the camera) from wandering in; the level's interactable
 * does the travel.
 * `glow` lights the top of a rising stair (the white of the floor above).
 */
export function doorRecess(
  parent: Object3D,
  physics: Physics,
  opts: { angle: number; radius: number; baseY: number; dir: 'up' | 'down' | 'flat'; mat: Material; floor?: Material; glow?: Material },
): RAPIER.Collider {
  const g = new Group();
  g.position.copy(polar(opts.radius, opts.angle, opts.baseY));
  g.rotation.y = opts.angle;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat = opts.mat) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const depth = 2.2;
  box(0.4, 4.4, depth, -1.5, 2.1, depth / 2);
  box(0.4, 4.4, depth, 1.5, 2.1, depth / 2);
  box(3.4, 4.4, 0.4, 0, 2.1, depth + 0.2);
  // The lintel slab tucks inside the side walls (not flush with their outer
  // faces) so no two faces share a plane.
  box(3.36, 0.42, depth + 0.36, 0, 4.11, depth / 2);
  if (opts.dir === 'up') {
    box(2.6, 0.3, depth, 0, -0.15, depth / 2);
    for (let k = 0; k < 6; k++) {
      const h = 0.2 * (k + 1);
      box(2.6, h, 0.32, 0, h / 2, 0.45 + k * 0.3);
    }
    if (opts.glow) {
      const lightPane = new Mesh(new PlaneGeometry(2.4, 1.6), opts.glow);
      lightPane.position.set(0, 2.6, depth - 0.02);
      lightPane.rotation.y = Math.PI;
      g.add(lightPane);
    }
  } else if (opts.dir === 'flat') {
    box(2.6, 0.3, depth, 0, -0.15, depth / 2, opts.floor ?? opts.mat);
    if (opts.glow) {
      const lightPane = new Mesh(new PlaneGeometry(2.6, 3.8), opts.glow);
      lightPane.position.set(0, 1.9, depth - 0.02);
      lightPane.rotation.y = Math.PI;
      g.add(lightPane);
    }
  } else {
    box(2.6, 0.3, 0.45, 0, -0.15, 0.225);
    for (let k = 1; k <= 6; k++) box(2.6, 1.4, 0.3, 0, -0.2 * k - 0.7, 0.3 + k * 0.3);
  }
  parent.add(g);
  g.updateMatrixWorld(true);
  const center = new Vector3(0, 2, 0.55).applyMatrix4(g.matrixWorld);
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), opts.angle);
  return physics.addBox(center, new Vector3(1.4, 2, 0.15), q);
}

import { BufferAttribute, BufferGeometry, type Mesh } from 'three';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { CharacterLighting } from './AnimeMaterial';

/**
 * Index-only levels of detail for skinned characters and creatures.
 *
 * Every level shares the source geometry's vertex buffers (positions,
 * normals, skin weights, colours) and only swaps the index buffer, so a
 * level change costs nothing and skinning, spring bones and outlines keep
 * working. Levels are built once per source geometry with meshoptimizer's
 * attribute-aware simplifier (normals and baked vertex colours weigh in,
 * open hems stay locked) and shared by every instance.
 */

/** Triangle ratio and max deviation (fraction of the mesh's extent) per level. */
const LEVELS: Array<{ ratio: number; error: number }> = [
  { ratio: 0.45, error: 0.006 },
  { ratio: 0.18, error: 0.02 },
];
/** Screen height (CSS px) of the whole character at the 0/1 and 1/2 boundaries. */
const BOUNDS = [300, 120];

const cache = new WeakMap<BufferGeometry, BufferGeometry[]>();
let ready = false;

/** Resolves once the simplifier's WebAssembly is compiled (await before building characters). */
export const meshLodReady: Promise<void> = MeshoptSimplifier.ready.then(
  () => {
    ready = true;
  },
  () => undefined,
);

function floatArray(attr: BufferAttribute, comps: number): Float32Array {
  const n = attr.count;
  const out = new Float32Array(n * comps);
  for (let i = 0; i < n; i++) {
    out[i * comps] = attr.getX(i);
    if (comps > 1) out[i * comps + 1] = attr.getY(i);
    if (comps > 2) out[i * comps + 2] = attr.getZ(i);
  }
  return out;
}

/** Level 0 (the source) plus coarser index-only levels. Cached per geometry. */
export function lodChain(geo: BufferGeometry): BufferGeometry[] {
  const hit = cache.get(geo);
  if (hit) return hit;
  const levels = [geo];
  cache.set(geo, levels);
  const pos = geo.attributes.position as BufferAttribute | undefined;
  if (!ready || !geo.index || geo.groups.length > 1 || !pos || !(pos.array instanceof Float32Array) || pos.itemSize !== 3) return levels;
  if (geo.index.count < 4500) return levels; // small meshes aren't worth a level
  const indices = geo.index.array instanceof Uint32Array ? geo.index.array : new Uint32Array(geo.index.array);
  const positions = pos.array;
  // Attributes that must survive simplification: shading normals and the
  // baked albedo in vertex colours (a colour boundary is a seam).
  const normal = geo.attributes.normal as BufferAttribute | undefined;
  const color = geo.attributes.color as BufferAttribute | undefined;
  const stride = (normal ? 3 : 0) + (color ? 3 : 0);
  let attrs: Float32Array | null = null;
  const weights: number[] = [];
  if (stride > 0) {
    attrs = new Float32Array(pos.count * stride);
    const n = normal ? floatArray(normal, 3) : null;
    const c = color ? floatArray(color, 3) : null;
    for (let i = 0; i < pos.count; i++) {
      let o = i * stride;
      if (n) for (let k = 0; k < 3; k++) attrs[o++] = n[i * 3 + k]!;
      if (c) for (let k = 0; k < 3; k++) attrs[o++] = c[i * 3 + k]!;
    }
    if (normal) weights.push(0.35, 0.35, 0.35);
    if (color) weights.push(1, 1, 1);
  }
  const small = pos.count < 65536;
  for (const lv of LEVELS) {
    const target = Math.floor((indices.length * lv.ratio) / 3) * 3;
    const [out] = attrs
      ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attrs, stride, weights, null, target, lv.error, ['LockBorder'])
      : MeshoptSimplifier.simplify(indices, positions, 3, target, lv.error, ['LockBorder']);
    const prev = levels[levels.length - 1]!.index!.count;
    if (out.length > prev * 0.8 || out.length < 3) break; // no real saving
    const g = new BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr);
    g.morphAttributes = geo.morphAttributes;
    g.morphTargetsRelative = geo.morphTargetsRelative;
    g.setIndex(new BufferAttribute(small ? new Uint16Array(out) : out, 1));
    g.boundingBox = geo.boundingBox;
    g.boundingSphere = geo.boundingSphere;
    g.name = `${geo.name}_lod${levels.length}`;
    g.userData = geo.userData;
    levels.push(g);
  }
  return levels;
}

/**
 * Picks one level for a whole character from its on-screen height (with
 * hysteresis so a character on a boundary doesn't flicker between levels)
 * and applies it to every registered mesh; outline shells run a level
 * coarser than the surface they trace.
 */
export class LodSwitcher {
  private readonly entries: Array<{ mesh: Mesh; levels: BufferGeometry[]; bias: number }> = [];
  level = 0;
  /** Forces a level (debug views, portraits); null = by screen size. */
  force: number | null = null;

  constructor(private readonly height: number) {}

  add(mesh: Mesh, bias = 0): void {
    const levels = lodChain(mesh.geometry);
    if (levels.length > 1) this.entries.push({ mesh, levels, bias });
  }

  get size(): number {
    return this.entries.length;
  }

  update(distance: number): void {
    if (!this.entries.length) return;
    const px = (this.height * CharacterLighting.lodScale * CharacterLighting.lodBias) / Math.max(0.05, distance);
    let l = this.level;
    if (this.force !== null) l = this.force;
    else {
      while (l > 0 && px > BOUNDS[l - 1]! * 1.08) l--;
      while (l < BOUNDS.length && px < BOUNDS[l]! * 0.92) l++;
    }
    this.level = l;
    for (const e of this.entries) {
      const g = e.levels[Math.min(l + (l > 0 ? e.bias : 0), e.levels.length - 1)]!;
      if (e.mesh.geometry !== g) e.mesh.geometry = g;
    }
  }
}

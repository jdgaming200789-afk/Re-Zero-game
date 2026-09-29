import type RAPIER from '@dimforge/rapier3d-compat';
import { BufferAttribute, BufferGeometry, Mesh, type Material } from 'three';
import type { Physics } from '../../physics/Physics';
import { Layer } from '../../physics/Physics';

export type HeightFn = (x: number, z: number) => number;
export type SplatFn = (x: number, z: number, h: number) => [number, number, number];

export interface TerrainSpec {
  /** Playable, collidable, high-resolution rectangle. */
  inner: { minX: number; maxX: number; minZ: number; maxZ: number; spacing: number };
  /** Visual-only horizon ring. */
  outer: { extent: number; spacing: number };
  height: HeightFn;
  splat: SplatFn;
}

/**
 * Heightfield terrain in two parts: a dense, collidable inner play area and
 * a coarse horizon skirt out to the view distance. Per-vertex splat weights
 * drive the terrain material's layer blend.
 */
export class DuneTerrain {
  readonly inner: Mesh;
  readonly outer: Mesh;
  collider: RAPIER.Collider | null = null;

  constructor(
    readonly spec: TerrainSpec,
    material: Material,
  ) {
    const i = spec.inner;
    this.inner = new Mesh(this.buildGrid(i.minX, i.maxX, i.minZ, i.maxZ, i.spacing, null), material);
    this.inner.receiveShadow = true;
    this.inner.castShadow = false;
    this.inner.name = 'TerrainInner';
    const e = spec.outer.extent;
    this.outer = new Mesh(this.buildGrid(-e, e, -e, e, spec.outer.spacing, i), material);
    this.outer.receiveShadow = true;
    this.outer.name = 'TerrainOuter';
  }

  heightAt(x: number, z: number): number {
    return this.spec.height(x, z);
  }

  private buildGrid(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    spacing: number,
    hole: TerrainSpec['inner'] | null,
  ): BufferGeometry {
    const nx = Math.round((maxX - minX) / spacing);
    const nz = Math.round((maxZ - minZ) / spacing);
    const vx = nx + 1;
    const vz = nz + 1;
    const pos = new Float32Array(vx * vz * 3);
    const nrm = new Float32Array(vx * vz * 3);
    const splat = new Float32Array(vx * vz * 3);
    const h = this.spec.height;
    for (let z = 0; z < vz; z++) {
      for (let x = 0; x < vx; x++) {
        const wx = minX + (x / nx) * (maxX - minX);
        const wz = minZ + (z / nz) * (maxZ - minZ);
        const k = (z * vx + x) * 3;
        const y = h(wx, wz) - (hole ? 0.03 : 0);
        pos[k] = wx;
        pos[k + 1] = y;
        pos[k + 2] = wz;
        // Analytic-ish normal from central differences of the height function.
        const e = spacing * 0.5;
        const dx = h(wx + e, wz) - h(wx - e, wz);
        const dz = h(wx, wz + e) - h(wx, wz - e);
        let n0 = -dx;
        let n1 = 2 * e;
        let n2 = -dz;
        const l = Math.hypot(n0, n1, n2);
        n0 /= l;
        n1 /= l;
        n2 /= l;
        nrm[k] = n0;
        nrm[k + 1] = n1;
        nrm[k + 2] = n2;
        const s = this.spec.splat(wx, wz, y);
        splat[k] = s[0];
        splat[k + 1] = s[1];
        splat[k + 2] = s[2];
      }
    }
    const idx: number[] = [];
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        if (hole) {
          const cx0 = minX + (x / nx) * (maxX - minX);
          const cx1 = minX + ((x + 1) / nx) * (maxX - minX);
          const cz0 = minZ + (z / nz) * (maxZ - minZ);
          const cz1 = minZ + ((z + 1) / nz) * (maxZ - minZ);
          if (cx0 >= hole.minX && cx1 <= hole.maxX && cz0 >= hole.minZ && cz1 <= hole.maxZ) continue;
        }
        const a = z * vx + x;
        const b = a + 1;
        const c = a + vx;
        const d = c + 1;
        // Alternate the diagonal to avoid directional artefacts on dunes.
        if ((x + z) % 2 === 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, c, d, a, d, b);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('normal', new BufferAttribute(nrm, 3));
    geo.setAttribute('splat', new BufferAttribute(splat, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  /** Trimesh collision for the inner play area. */
  buildCollider(physics: Physics): RAPIER.Collider {
    const g = this.inner.geometry;
    const pos = g.getAttribute('position').array as Float32Array;
    const indices = new Uint32Array(g.index!.array);
    this.collider = physics.addTrimesh(new Float32Array(pos), indices, Layer.Environment, { kind: 'static', surface: 'sand' });
    return this.collider;
  }

  dispose(): void {
    this.inner.geometry.dispose();
    this.outer.geometry.dispose();
  }
}

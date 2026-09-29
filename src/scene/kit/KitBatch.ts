import type RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import type { Physics } from '../../physics/Physics';
import { Layer } from '../../physics/Physics';
import type { KitLibrary, KitPiece } from './KitLibrary';

export interface PlaceOptions {
  rotY?: number;
  rotation?: Quaternion;
  scale?: number | Vector3;
  /** Create collision for this instance (default true). */
  collide?: boolean;
  surface?: string;
}

interface Instance {
  piece: KitPiece;
  matrix: Matrix4;
  collide: boolean;
  surface: string;
}

interface Cell {
  center: Vector3;
  lodGroups: Group[];
  lodDistances: number[];
  current: number;
}

const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();

/**
 * Places kit pieces and turns them into GPU instances.
 *
 * Instances are bucketed into spatial cells; each cell gets one
 * InstancedMesh per (piece, LOD, material part). Cells switch LOD by camera
 * distance, which also gives coarse culling for big exterior areas.
 * Collision is generated from each piece's authored proxies.
 */
export class KitBatch {
  private readonly instances: Instance[] = [];
  private readonly cells: Cell[] = [];
  readonly root = new Group();
  readonly colliders: RAPIER.Collider[] = [];
  private lodTimer = 0;

  constructor(
    private readonly kit: KitLibrary,
    private readonly physics: Physics,
    private readonly cellSize = 24,
  ) {
    this.root.name = 'KitBatch';
  }

  place(name: string, x: number, y: number, z: number, opts: PlaceOptions = {}): Matrix4 {
    const piece = this.kit.piece(name);
    const q = opts.rotation ?? _quat.setFromEuler(new Euler(0, opts.rotY ?? 0, 0));
    const s = typeof opts.scale === 'number' ? _scl.setScalar(opts.scale) : (opts.scale ?? _scl.set(1, 1, 1));
    const matrix = new Matrix4().compose(_pos.set(x, y, z), q, s);
    this.instances.push({ piece, matrix, collide: opts.collide ?? true, surface: opts.surface ?? String(piece.extras.surface ?? 'stone') });
    return matrix;
  }

  placeMatrix(name: string, matrix: Matrix4, collide = true): void {
    const piece = this.kit.piece(name);
    this.instances.push({ piece, matrix: matrix.clone(), collide, surface: String(piece.extras.surface ?? 'stone') });
  }

  get count(): number {
    return this.instances.length;
  }

  /** Create meshes and colliders. Call once after all placements. */
  build(parent: Object3D, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): void {
    const castShadow = opts.castShadow ?? true;
    const receiveShadow = opts.receiveShadow ?? true;
    // Bucket by cell
    const buckets = new Map<string, Instance[]>();
    for (const inst of this.instances) {
      _pos.setFromMatrixPosition(inst.matrix);
      const key = `${Math.floor(_pos.x / this.cellSize)},${Math.floor(_pos.z / this.cellSize)}`;
      const list = buckets.get(key) ?? [];
      list.push(inst);
      buckets.set(key, list);
    }

    for (const [key, list] of buckets) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      // Group instances of the same piece
      const byPiece = new Map<KitPiece, Matrix4[]>();
      for (const inst of list) {
        const arr = byPiece.get(inst.piece) ?? [];
        arr.push(inst.matrix);
        byPiece.set(inst.piece, arr);
      }
      const maxLods = Math.max(...Array.from(byPiece.keys()).map((p) => p.lods.length));
      const lodGroups: Group[] = [];
      for (let l = 0; l < maxLods; l++) {
        const g = new Group();
        g.name = `cell ${key} lod${l}`;
        lodGroups.push(g);
        this.root.add(g);
      }
      for (const [piece, matrices] of byPiece) {
        for (let l = 0; l < maxLods; l++) {
          // Pieces with fewer LODs reuse their last LOD at farther distances.
          const lod = piece.lods[Math.min(l, piece.lods.length - 1)]!;
          for (const part of lod) {
            const im = new InstancedMesh(part.geometry, part.material, matrices.length);
            for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]!);
            im.instanceMatrix.needsUpdate = true;
            im.castShadow = castShadow && l === 0;
            im.receiveShadow = receiveShadow;
            im.computeBoundingSphere();
            im.name = `${piece.name}#${l}`;
            lodGroups[l]!.add(im);
          }
        }
      }
      const reach = Math.max(...Array.from(byPiece.keys()).map((p) => p.radius));
      const d1 = Math.max(28, reach * 9);
      const d2 = Math.max(70, reach * 20);
      const cell: Cell = {
        center: new Vector3((cx + 0.5) * this.cellSize, 0, (cz + 0.5) * this.cellSize),
        lodGroups,
        lodDistances: [d1, d2],
        current: -1,
      };
      this.setCellLod(cell, 0);
      this.cells.push(cell);
    }

    parent.add(this.root);
    this.buildColliders();
  }

  private setCellLod(cell: Cell, lod: number): void {
    if (cell.current === lod) return;
    cell.current = lod;
    cell.lodGroups.forEach((g, i) => (g.visible = i === lod));
  }

  /** Switch cell LODs by distance from the camera (cheap; throttled). */
  update(dt: number, cameraPos: Vector3): void {
    this.lodTimer -= dt;
    if (this.lodTimer > 0) return;
    this.lodTimer = 0.25;
    const half = this.cellSize * 0.5;
    for (const cell of this.cells) {
      const dx = Math.max(0, Math.abs(cameraPos.x - cell.center.x) - half);
      const dz = Math.max(0, Math.abs(cameraPos.z - cell.center.z) - half);
      const d = Math.hypot(dx, dz);
      let lod = 0;
      if (d > cell.lodDistances[0]!) lod = 1;
      if (d > cell.lodDistances[1]!) lod = 2;
      this.setCellLod(cell, Math.min(lod, cell.lodGroups.length - 1));
    }
  }

  private buildColliders(): void {
    const p = this.physics;
    const world = new Matrix4();
    for (const inst of this.instances) {
      if (!inst.collide) continue;
      for (const c of inst.piece.colliders) {
        const owner = { kind: 'static' as const, surface: inst.surface };
        if (c.type === 'box' || c.type === 'cyl') {
          world.multiplyMatrices(inst.matrix, c.matrix);
          world.decompose(_pos, _quat, _scl);
          if (c.type === 'box') {
            this.colliders.push(p.addBox(_pos.clone(), c.halfExtents.clone().multiply(_scl), _quat.clone(), Layer.Environment, owner));
          } else {
            this.colliders.push(p.addOrientedCylinder(_pos.clone(), c.halfHeight * _scl.y, c.radius * Math.max(_scl.x, _scl.z), _quat.clone(), Layer.Environment, owner));
          }
        } else if (c.points) {
          const pts = new Float32Array(c.points.length);
          const v = new Vector3();
          for (let i = 0; i < c.points.length; i += 3) {
            v.set(c.points[i]!, c.points[i + 1]!, c.points[i + 2]!).applyMatrix4(inst.matrix);
            pts[i] = v.x;
            pts[i + 1] = v.y;
            pts[i + 2] = v.z;
          }
          if (c.type === 'hull') {
            const col = p.addConvexHull(pts, Layer.Environment, owner);
            if (col) this.colliders.push(col);
          } else if (c.indices) {
            this.colliders.push(p.addTrimesh(pts, c.indices, Layer.Environment, owner));
          }
        }
      }
    }
  }

  dispose(): void {
    for (const c of this.colliders) this.physics.removeCollider(c);
    this.colliders.length = 0;
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose();
    });
  }
}

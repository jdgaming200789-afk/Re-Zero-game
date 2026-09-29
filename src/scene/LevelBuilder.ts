import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/Physics';
import { Layer } from '../physics/Physics';

/**
 * Helpers that create visible geometry and matching collision together,
 * so blockouts and procedural rooms never drift out of sync with physics.
 */
export class LevelBuilder {
  readonly colliders: RAPIER.Collider[] = [];

  constructor(
    private readonly physics: Physics,
    readonly parent: Object3D,
  ) {}

  box(
    size: [number, number, number],
    position: [number, number, number],
    material: Material,
    opts: { rotY?: number; rotX?: number; rotZ?: number; collide?: boolean; castShadow?: boolean; receiveShadow?: boolean; surface?: string; layer?: number; name?: string } = {},
  ): Mesh {
    const geo = new BoxGeometry(size[0], size[1], size[2]);
    const mesh = new Mesh(geo, material);
    mesh.position.set(...position);
    mesh.rotation.set(opts.rotX ?? 0, opts.rotY ?? 0, opts.rotZ ?? 0);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    if (opts.name) mesh.name = opts.name;
    this.parent.add(mesh);
    if (opts.collide !== false) {
      const q = new Quaternion().setFromEuler(new Euler(opts.rotX ?? 0, opts.rotY ?? 0, opts.rotZ ?? 0));
      const c = this.physics.addBox(
        new Vector3(...position),
        new Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
        q,
        opts.layer ?? Layer.Environment,
        { kind: 'static', surface: opts.surface ?? 'stone' },
      );
      mesh.userData.collider = c;
      this.colliders.push(c);
    }
    return mesh;
  }

  cylinder(
    radius: number,
    height: number,
    position: [number, number, number],
    material: Material,
    opts: { segments?: number; collide?: boolean; surface?: string; radiusTop?: number } = {},
  ): Mesh {
    const geo = new CylinderGeometry(opts.radiusTop ?? radius, radius, height, opts.segments ?? 24);
    const mesh = new Mesh(geo, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.parent.add(mesh);
    if (opts.collide !== false) {
      const c = this.physics.addCylinder(new Vector3(...position), height / 2, Math.max(radius, opts.radiusTop ?? radius), Layer.Environment, {
        kind: 'static',
        surface: opts.surface ?? 'stone',
      });
      this.colliders.push(c);
    }
    return mesh;
  }

  /** Straight staircase rising along +Z from `start` (bottom-front-centre). */
  stairs(start: [number, number, number], steps: number, rise: number, run: number, width: number, material: Material, rotY = 0): void {
    const [sx, sy, sz] = start;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    for (let i = 0; i < steps; i++) {
      const h = rise * (i + 1);
      const localZ = run * i + run / 2;
      this.box([width, h, run], [sx + sin * localZ, sy + h / 2, sz + cos * localZ], material, { rotY });
    }
  }

  /** Arbitrary mesh with trimesh collision. */
  mesh(geometry: BufferGeometry, material: Material, position: [number, number, number], collide = true, surface = 'stone'): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.parent.add(mesh);
    if (collide) {
      const c = this.physics.addStaticMesh(mesh, Layer.Environment, { kind: 'static', surface });
      if (c) this.colliders.push(c);
    }
    return mesh;
  }

  removeCollider(mesh: Mesh): void {
    const c = mesh.userData.collider as RAPIER.Collider | undefined;
    if (!c) return;
    this.physics.removeCollider(c);
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    delete mesh.userData.collider;
  }
}

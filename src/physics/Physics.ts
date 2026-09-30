import RAPIER from '@dimforge/rapier3d-compat';
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import { createLogger } from '../core/Log';

const log = createLogger('Physics');

/**
 * Collision layers. A collider has a membership (what it is) and a filter
 * (what it collides with). Rapier packs both into one 32-bit number.
 */
export const Layer = {
  Environment: 1 << 0,
  Player: 1 << 1,
  Party: 1 << 2,
  Enemy: 1 << 3,
  Trigger: 1 << 4,
  Interactable: 1 << 5,
  Projectile: 1 << 6,
  Prop: 1 << 7,
  /** Blocks the camera and line of sight but not characters (e.g. glass, foliage). */
  CameraOnly: 1 << 8,
  /** Blocks characters but not the camera (invisible walls at ledges). */
  CharacterOnly: 1 << 9,
  Water: 1 << 10,
  All: 0xffff,
} as const;

export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export const Masks = {
  characterBlockers: Layer.Environment | Layer.Prop | Layer.CharacterOnly,
  camera: Layer.Environment | Layer.CameraOnly,
  lineOfSight: Layer.Environment | Layer.CameraOnly | Layer.Prop,
  ground: Layer.Environment | Layer.Prop | Layer.CharacterOnly,
  interaction: Layer.Environment | Layer.Prop,
};

export interface ColliderOwner {
  entityId?: number;
  kind: 'static' | 'character' | 'trigger' | 'prop' | 'hurtbox' | 'projectile';
  surface?: string;
  onEnter?(other: ColliderOwner, otherCollider: RAPIER.Collider): void;
  onExit?(other: ColliderOwner, otherCollider: RAPIER.Collider): void;
}

export interface RayHit {
  point: Vector3;
  normal: Vector3;
  distance: number;
  collider: RAPIER.Collider;
  owner: ColliderOwner | undefined;
}

export class Physics {
  static rapier = RAPIER;
  private static initialized = false;

  readonly world: RAPIER.World;
  private readonly eventQueue: RAPIER.EventQueue;
  private readonly owners = new Map<number, ColliderOwner>();
  private debugLines: LineSegments | null = null;

  static async init(): Promise<void> {
    if (Physics.initialized) return;
    await RAPIER.init();
    Physics.initialized = true;
    log.info('Rapier initialised', RAPIER.version());
  }

  constructor(gravity = -9.81) {
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    this.world.timestep = 1 / 60;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      const a = this.owners.get(h1);
      const b = this.owners.get(h2);
      const c1 = this.world.getCollider(h1);
      const c2 = this.world.getCollider(h2);
      if (!a || !b || !c1 || !c2) return;
      if (started) {
        a.onEnter?.(b, c2);
        b.onEnter?.(a, c1);
      } else {
        a.onExit?.(b, c2);
        b.onExit?.(a, c1);
      }
    });
  }

  setOwner(collider: RAPIER.Collider, owner: ColliderOwner): void {
    this.owners.set(collider.handle, owner);
  }

  ownerOf(collider: RAPIER.Collider): ColliderOwner | undefined {
    return this.owners.get(collider.handle);
  }

  // ------------------------------------------------------------------ creation
  createFixedBody(position?: Vector3, rotation?: Quaternion): RAPIER.RigidBody {
    const desc = RAPIER.RigidBodyDesc.fixed();
    if (position) desc.setTranslation(position.x, position.y, position.z);
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    return this.world.createRigidBody(desc);
  }

  addBox(
    center: Vector3,
    halfExtents: Vector3,
    rotation: Quaternion | null,
    membership: number = Layer.Environment,
    owner: ColliderOwner = { kind: 'static' },
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(membership, Layer.All));
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  addCylinder(
    center: Vector3,
    halfHeight: number,
    radius: number,
    membership: number = Layer.Environment,
    owner: ColliderOwner = { kind: 'static' },
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(membership, Layer.All));
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  /**
   * A flat round floor at `center` (its top surface), as a triangle mesh in
   * rings of small triangles. Prefer this to a wide, thin cylinder: against a
   * huge flat cylinder the character controller gets imprecise contacts and
   * can slowly slip through.
   */
  addDisc(center: Vector3, radius: number, membership: number = Layer.Environment, owner: ColliderOwner = { kind: 'static' }): RAPIER.Collider {
    const rings = Math.max(1, Math.ceil(radius / 2.5));
    const segs = Math.max(12, Math.ceil((Math.PI * 2 * radius) / 2.5));
    const verts: number[] = [center.x, center.y, center.z];
    for (let r = 1; r <= rings; r++) {
      const rr = (radius * r) / rings;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        verts.push(center.x + Math.sin(a) * rr, center.y, center.z + Math.cos(a) * rr);
      }
    }
    const at = (ring: number, i: number) => (ring === 0 ? 0 : 1 + (ring - 1) * segs + (i % segs));
    const idx: number[] = [];
    for (let r = 0; r < rings; r++) {
      for (let i = 0; i < segs; i++) {
        // Angles run clockwise seen from above; wind so normals face up.
        if (r === 0) idx.push(0, at(1, i), at(1, i + 1));
        else idx.push(at(r, i), at(r + 1, i + 1), at(r, i + 1), at(r, i), at(r + 1, i), at(r + 1, i + 1));
      }
    }
    return this.addTrimesh(new Float32Array(verts), new Uint32Array(idx), membership, owner);
  }

  /** Oriented cylinder (axis = local Y rotated by `rotation`). */
  addOrientedCylinder(
    center: Vector3,
    halfHeight: number,
    radius: number,
    rotation: Quaternion | null,
    membership: number = Layer.Environment,
    owner: ColliderOwner = { kind: 'static' },
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(membership, Layer.All));
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  /** Convex hull around world-space points (falls back to null if degenerate). */
  addConvexHull(points: Float32Array, membership: number = Layer.Environment, owner: ColliderOwner = { kind: 'static' }): RAPIER.Collider | null {
    const desc = RAPIER.ColliderDesc.convexHull(points);
    if (!desc) return null;
    desc.setCollisionGroups(groups(membership, Layer.All));
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  /** Static trimesh from raw world-space arrays. */
  addTrimesh(vertices: Float32Array, indices: Uint32Array, membership: number = Layer.Environment, owner: ColliderOwner = { kind: 'static' }): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(groups(membership, Layer.All));
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  /** Static triangle-mesh collider from a Three.js mesh (uses its world transform). */
  addStaticMesh(mesh: Mesh, membership: number = Layer.Environment, owner: ColliderOwner = { kind: 'static' }): RAPIER.Collider | null {
    mesh.updateWorldMatrix(true, false);
    const data = extractTriangles(mesh.geometry, mesh.matrixWorld);
    if (!data) return null;
    const desc = RAPIER.ColliderDesc.trimesh(data.vertices, data.indices).setCollisionGroups(groups(membership, Layer.All));
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  /** Adds every mesh under `root` as static collision (for kit collision proxies). */
  addStaticHierarchy(root: Object3D, membership: number = Layer.Environment, surface?: string): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const c = this.addStaticMesh(o as Mesh, membership, { kind: 'static', surface: surface ?? (o.userData.surface as string | undefined) });
        if (c) out.push(c);
      }
    });
    return out;
  }

  addHeightfield(
    nrows: number,
    ncols: number,
    heights: Float32Array,
    scale: Vector3,
    center: Vector3,
    owner: ColliderOwner = { kind: 'static', surface: 'sand' },
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, { x: scale.x, y: scale.y, z: scale.z })
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(Layer.Environment, Layer.All));
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  /** Sensor volume that reports enter/exit of characters. */
  addTriggerBox(center: Vector3, halfExtents: Vector3, rotation: Quaternion | null, owner: ColliderOwner): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
      .setCollisionGroups(groups(Layer.Trigger, Layer.Player | Layer.Party | Layer.Enemy));
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    const c = this.world.createCollider(desc);
    this.setOwner(c, { ...owner, kind: 'trigger' });
    return c;
  }

  addTriggerSphere(center: Vector3, radius: number, owner: ColliderOwner): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.ball(radius)
      .setTranslation(center.x, center.y, center.z)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
      .setCollisionGroups(groups(Layer.Trigger, Layer.Player | Layer.Party | Layer.Enemy));
    const c = this.world.createCollider(desc);
    this.setOwner(c, { ...owner, kind: 'trigger' });
    return c;
  }

  /** Kinematic capsule for characters (moved via the character controller). */
  createCharacter(
    position: Vector3,
    radius: number,
    halfHeight: number,
    membership: number,
    filter: number,
    owner: ColliderOwner,
  ): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y + halfHeight + radius, position.z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius)
        // Trigger volumes must see characters; the character controller
        // ignores sensors when resolving movement.
        .setCollisionGroups(groups(membership, filter | Layer.Trigger))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),
      body,
    );
    this.setOwner(collider, owner);
    return { body, collider };
  }

  removeCollider(c: RAPIER.Collider): void {
    this.owners.delete(c.handle);
    if (this.world.getCollider(c.handle)) this.world.removeCollider(c, true);
  }

  removeBody(b: RAPIER.RigidBody): void {
    const n = b.numColliders();
    for (let i = 0; i < n; i++) this.owners.delete(b.collider(i).handle);
    if (this.world.getRigidBody(b.handle)) this.world.removeRigidBody(b);
  }

  // ------------------------------------------------------------------ queries
  raycast(
    origin: Vector3,
    dir: Vector3,
    maxDist: number,
    mask: number = Masks.lineOfSight,
    exclude?: RAPIER.Collider,
  ): RayHit | null {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, groups(Layer.All, mask), exclude, undefined, (c) => !c.isSensor());
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
      owner: this.owners.get(hit.collider.handle),
    };
  }

  /** True if nothing in `mask` blocks the segment a→b. */
  lineOfSight(a: Vector3, b: Vector3, mask: number = Masks.lineOfSight, exclude?: RAPIER.Collider): boolean {
    const dir = _tmpDir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return true;
    dir.divideScalar(len);
    return this.raycast(a, dir, len - 0.02, mask, exclude) === null;
  }

  /** Sweeps a sphere; returns distance to first hit or null. */
  sphereCast(origin: Vector3, dir: Vector3, radius: number, maxDist: number, mask: number = Masks.camera): number | null {
    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: dir.x, y: dir.y, z: dir.z },
      shape,
      0,
      maxDist,
      true,
      undefined,
      groups(Layer.All, mask),
      undefined,
      undefined,
      (c) => !c.isSensor(),
    );
    return hit ? hit.time_of_impact : null;
  }

  overlapSphere(center: Vector3, radius: number, mask: number, out: RAPIER.Collider[] = []): RAPIER.Collider[] {
    out.length = 0;
    this.world.intersectionsWithShape(
      { x: center.x, y: center.y, z: center.z },
      { x: 0, y: 0, z: 0, w: 1 },
      new RAPIER.Ball(radius),
      (c) => {
        out.push(c);
        return true;
      },
      undefined,
      groups(Layer.All, mask),
    );
    return out;
  }

  /** Ground height below a point, or null if nothing within `maxDist`. */
  groundHeight(x: number, y: number, z: number, maxDist = 50): number | null {
    const hit = this.raycast(_tmpA.set(x, y, z), _down, maxDist, Masks.ground);
    return hit ? hit.point.y : null;
  }

  // ------------------------------------------------------------------ debug
  setDebugVisible(parent: Object3D, visible: boolean): void {
    if (!visible) {
      this.debugLines?.removeFromParent();
      return;
    }
    if (!this.debugLines) {
      this.debugLines = new LineSegments(
        new BufferGeometry(),
        new LineBasicMaterial({ vertexColors: true, depthTest: true, transparent: true, opacity: 0.6 }),
      );
      this.debugLines.frustumCulled = false;
      this.debugLines.renderOrder = 999;
    }
    parent.add(this.debugLines);
  }

  updateDebug(): void {
    if (!this.debugLines?.parent) return;
    const { vertices, colors } = this.world.debugRender();
    const g = this.debugLines.geometry;
    g.setAttribute('position', new BufferAttribute(vertices, 3));
    g.setAttribute('color', new BufferAttribute(colors, 4));
  }
}

const _tmpDir = new Vector3();
const _tmpA = new Vector3();
const _down = new Vector3(0, -1, 0);

function extractTriangles(geometry: BufferGeometry, matrix: Matrix4): { vertices: Float32Array; indices: Uint32Array } | null {
  const pos = geometry.getAttribute('position');
  if (!pos) return null;
  const vertices = new Float32Array(pos.count * 3);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    vertices[i * 3] = v.x;
    vertices[i * 3 + 1] = v.y;
    vertices[i * 3 + 2] = v.z;
  }
  let indices: Uint32Array;
  if (geometry.index) {
    indices = new Uint32Array(geometry.index.array);
  } else {
    indices = new Uint32Array(pos.count);
    for (let i = 0; i < pos.count; i++) indices[i] = i;
  }
  return { vertices, indices };
}

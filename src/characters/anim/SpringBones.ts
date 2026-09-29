import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three';

export interface SpringSettings {
  stiffness: number;
  drag: number;
  gravity: number;
  /** Radius of each joint for collisions (m). */
  hitRadius: number;
}

export interface SphereCollider {
  bone: Object3D;
  offset: Vector3;
  radius: number;
}

interface Joint {
  bone: Bone;
  child: Bone | null;
  /** Tail in bone-local space (child position or extrapolated). */
  localTail: Vector3;
  restLocal: Quaternion;
  length: number;
  current: Vector3;
  prev: Vector3;
  initialized: boolean;
}

/**
 * VRM-style spring bones for hair strands, braids, drills, skirts and capes.
 * Each joint's tail is a verlet particle pulled back toward its animated
 * rest direction, under gravity and drag, pushed out of sphere colliders
 * on the body; the bone is then rotated to point at the particle.
 */
export class SpringChainSystem {
  private readonly chains: Joint[][] = [];
  private readonly colliders: SphereCollider[] = [];
  private readonly settings: SpringSettings[] = [];
  /** External wind (world m/s), e.g. desert gusts. */
  readonly wind = new Vector3();
  private accumulator = 0;

  addChain(bones: Bone[], s: SpringSettings): void {
    const joints: Joint[] = [];
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i]!;
      const child = bones[i + 1] ?? null;
      let localTail: Vector3;
      if (child) localTail = child.position.clone();
      else {
        // glTF bones from Blender point along local +Y: extrapolate the last
        // tail with the previous segment's length.
        const prevLen = i > 0 ? joints[i - 1]!.length : 0.08;
        localTail = new Vector3(0, prevLen || 0.08, 0);
      }
      joints.push({
        bone: b,
        child,
        localTail,
        restLocal: b.quaternion.clone(),
        length: localTail.length(),
        current: new Vector3(),
        prev: new Vector3(),
        initialized: false,
      });
    }
    this.chains.push(joints);
    this.settings.push(s);
  }

  addCollider(c: SphereCollider): void {
    this.colliders.push(c);
  }

  get chainCount(): number {
    return this.chains.length;
  }

  /** Snap particles to the current pose (after teleports / cutscene cuts). */
  reset(): void {
    for (const chain of this.chains) for (const j of chain) j.initialized = false;
  }

  update(dt: number): void {
    // Fixed 60 Hz sub-steps for stability regardless of frame rate.
    this.accumulator = Math.min(this.accumulator + dt, 0.1);
    const step = 1 / 60;
    while (this.accumulator >= step) {
      this.accumulator -= step;
      this.stepOnce(step);
    }
  }

  private stepOnce(dt: number): void {
    const colliderWorld = this.colliders.map((c) => ({ c: c.offset.clone().applyMatrix4(c.bone.matrixWorld), r: c.radius }));
    for (let ci = 0; ci < this.chains.length; ci++) {
      const chain = this.chains[ci]!;
      const s = this.settings[ci]!;
      for (const j of chain) {
        const b = j.bone;
        // Restore the animated local rotation before simulating this joint.
        b.quaternion.copy(j.restLocal);
        b.updateMatrixWorld(true);
        const head = _head.setFromMatrixPosition(b.matrixWorld);
        const restTail = _rest.copy(j.localTail).applyMatrix4(b.matrixWorld);
        if (!j.initialized) {
          j.current.copy(restTail);
          j.prev.copy(restTail);
          j.initialized = true;
        }
        const restDir = _dir.subVectors(restTail, head).normalize();
        const next = _next
          .copy(j.current)
          .addScaledVector(_vel.subVectors(j.current, j.prev), 1 - s.drag)
          .addScaledVector(restDir, s.stiffness * dt)
          .add(_g.set(0, -s.gravity * dt, 0))
          .addScaledVector(this.wind, dt * 0.02);
        // Length constraint
        next.sub(head).normalize().multiplyScalar(j.length).add(head);
        // Collisions
        for (const col of colliderWorld) {
          const d = _d.subVectors(next, col.c);
          const minD = col.r + s.hitRadius;
          const len = d.length();
          if (len < minD) {
            next.copy(col.c).addScaledVector(d.normalize(), minD);
            next.sub(head).normalize().multiplyScalar(j.length).add(head);
          }
        }
        j.prev.copy(j.current);
        j.current.copy(next);
        // Rotate the bone so its tail points at the particle.
        _inv.copy(b.matrixWorld).invert();
        const localTarget = _lt.copy(next).applyMatrix4(_inv).normalize();
        const localRest = _lr.copy(j.localTail).normalize();
        _q.setFromUnitVectors(localRest, localTarget);
        b.quaternion.copy(j.restLocal).multiply(_q);
        b.updateMatrixWorld(true);
      }
    }
  }

  /** Record the current (animated) local rotations as each joint's rest. */
  captureRest(): void {
    for (const chain of this.chains) for (const j of chain) j.restLocal.copy(j.bone.quaternion);
  }
}

const _head = new Vector3();
const _rest = new Vector3();
const _dir = new Vector3();
const _next = new Vector3();
const _vel = new Vector3();
const _g = new Vector3();
const _d = new Vector3();
const _lt = new Vector3();
const _lr = new Vector3();
const _q = new Quaternion();
const _inv = new Matrix4();

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

/** Reference step the stiffness / gravity / drag settings are tuned for. */
const BASE_STEP = 1 / 60;
/** Largest distance a particle may travel in one step (m): no explosions. */
const MAX_STEP_TRAVEL = 0.12;

/**
 * VRM-style spring bones for hair strands, braids, drills, skirts and capes.
 * Each joint's tail is a verlet particle pulled back toward its animated
 * rest direction, under gravity and drag, pushed out of sphere colliders
 * on the body; the bone is then rotated to point at the particle.
 *
 * Stability at speed: particles live partly in the character's own frame
 * (the `center`, like VRM's spring center) — only `inertia` of the body's
 * travel and turning reaches them, so sprinting streams the hair back
 * instead of slamming it into the head and shoulders. The simulation runs
 * every frame in equal sub-steps of at most 1/60 s with time-corrected
 * verlet, so it stays in lock-step with the interpolated body at any
 * refresh rate (no 60 Hz judder at 144 Hz, no uneven kicks at 30 Hz).
 */
export class SpringChainSystem {
  private readonly chains: Joint[][] = [];
  private readonly colliders: SphereCollider[] = [];
  private readonly settings: SpringSettings[] = [];
  /** External wind (world m/s), e.g. desert gusts. */
  readonly wind = new Vector3();
  /** The character root: particles are carried along with it. */
  center: Object3D | null = null;
  /** Fraction of the center's own motion the particles feel (0..1). */
  inertia = 0.35;
  private centerInit = false;
  private readonly lastCenterPos = new Vector3();
  private readonly lastCenterQ = new Quaternion();
  private prevStep = BASE_STEP;

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
    this.centerInit = false;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.carryWithCenter();
    const n = Math.max(1, Math.ceil(dt / BASE_STEP - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.stepOnce(h);
  }

  /** Move every particle with (1 - inertia) of the center's motion since last frame. */
  private carryWithCenter(): void {
    const c = this.center;
    if (!c) return;
    c.matrixWorld.decompose(_cp, _cq, _cs);
    if (!this.centerInit) {
      this.centerInit = true;
      this.lastCenterPos.copy(_cp);
      this.lastCenterQ.copy(_cq);
      return;
    }
    const carry = 1 - this.inertia;
    _dq.copy(_cq).multiply(_qi.copy(this.lastCenterQ).invert());
    _pq.identity().slerp(_dq, carry);
    _dp.subVectors(_cp, this.lastCenterPos).multiplyScalar(carry);
    const pivot = this.lastCenterPos;
    for (const chain of this.chains) {
      for (const j of chain) {
        if (!j.initialized) continue;
        for (const p of [j.current, j.prev]) p.sub(pivot).applyQuaternion(_pq).add(pivot).add(_dp);
      }
    }
    this.lastCenterPos.copy(_cp);
    this.lastCenterQ.copy(_cq);
  }

  private stepOnce(dt: number): void {
    // Time-corrected verlet: velocity scaled by the step ratio, drag and
    // forces converted from their 60 Hz tuning.
    const ratio = dt / this.prevStep;
    this.prevStep = dt;
    const f = (dt * dt) / BASE_STEP;
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
        _vel.subVectors(j.current, j.prev).multiplyScalar(Math.pow(1 - s.drag, dt / BASE_STEP) * ratio);
        const sp = _vel.length();
        if (sp > MAX_STEP_TRAVEL) _vel.multiplyScalar(MAX_STEP_TRAVEL / sp);
        const next = _next
          .copy(j.current)
          .add(_vel)
          .addScaledVector(restDir, s.stiffness * f)
          .add(_g.set(0, -s.gravity * f, 0))
          .addScaledVector(this.wind, f * 0.02);
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
const _cp = new Vector3();
const _cq = new Quaternion();
const _cs = new Vector3();
const _dq = new Quaternion();
const _qi = new Quaternion();
const _pq = new Quaternion();
const _dp = new Vector3();

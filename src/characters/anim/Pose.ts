import { Euler, Quaternion, Vector3 } from 'three';
import { HUMAN_BONES, mirrorBone, type HumanBone } from '../rig/HumanoidRig';

const DEG = Math.PI / 180;
export const BONE_INDEX: Record<HumanBone, number> = Object.fromEntries(HUMAN_BONES.map((b, i) => [b, i])) as Record<HumanBone, number>;
const N = HUMAN_BONES.length;

/** Degrees in character space: [x (pitch about the left axis), y (yaw), z (roll)]. */
export type Euler3 = [number, number, number];
export type PoseSpec = Partial<Record<HumanBone, Euler3>> & { hipsOffset?: [number, number, number] };

/**
 * A full-body pose as normalised local rotations (identity = rest pose)
 * plus a hips translation offset in character space (metres).
 */
export class Pose {
  readonly rot: Quaternion[] = Array.from({ length: N }, () => new Quaternion());
  readonly hipsOffset = new Vector3();

  identity(): this {
    for (const q of this.rot) q.identity();
    this.hipsOffset.set(0, 0, 0);
    return this;
  }

  copy(o: Pose): this {
    for (let i = 0; i < N; i++) this.rot[i]!.copy(o.rot[i]!);
    this.hipsOffset.copy(o.hipsOffset);
    return this;
  }

  get(b: HumanBone): Quaternion {
    return this.rot[BONE_INDEX[b]]!;
  }

  /** this = lerp(a, b, t) per bone, optionally weighted per bone by `mask`. */
  blend(a: Pose, b: Pose, t: number, mask?: Float32Array): this {
    for (let i = 0; i < N; i++) {
      const w = mask ? t * mask[i]! : t;
      this.rot[i]!.slerpQuaternions(a.rot[i]!, b.rot[i]!, w);
    }
    const hw = mask ? t * mask[BONE_INDEX.hips]! : t;
    this.hipsOffset.lerpVectors(a.hipsOffset, b.hipsOffset, hw);
    return this;
  }

  /** Apply an additive pose on top (rotation composition), scaled by weight. */
  addScaled(add: Pose, weight: number): this {
    for (let i = 0; i < N; i++) {
      _q.identity().slerp(add.rot[i]!, weight);
      this.rot[i]!.multiply(_q);
    }
    this.hipsOffset.addScaledVector(add.hipsOffset, weight);
    return this;
  }

  /** Rotate one bone further by euler degrees (procedural layers). */
  rotate(b: HumanBone, x: number, y: number, z: number): this {
    _q.setFromEuler(_e.set(x * DEG, y * DEG, z * DEG, 'XYZ'));
    this.rot[BONE_INDEX[b]]!.multiply(_q);
    return this;
  }

  /** Pre-multiply (rotation expressed in the parent-accumulated frame). */
  rotatePre(b: HumanBone, q: Quaternion): this {
    this.rot[BONE_INDEX[b]]!.premultiply(q);
    return this;
  }

  static fromSpec(spec: PoseSpec, out = new Pose()): Pose {
    out.identity();
    for (const b of HUMAN_BONES) {
      const e = spec[b];
      if (e) out.rot[BONE_INDEX[b]]!.setFromEuler(_e.set(e[0] * DEG, e[1] * DEG, e[2] * DEG, 'XYZ'));
    }
    if (spec.hipsOffset) out.hipsOffset.fromArray(spec.hipsOffset);
    return out;
  }
}

/** Mirror a spec left↔right (negate yaw and roll, swap sides). */
export function mirrorSpec(spec: PoseSpec): PoseSpec {
  const out: PoseSpec = {};
  for (const b of HUMAN_BONES) {
    const e = spec[b];
    if (!e) continue;
    out[mirrorBone(b)] = [e[0], -e[1], -e[2]];
  }
  if (spec.hipsOffset) out.hipsOffset = [-spec.hipsOffset[0], spec.hipsOffset[1], spec.hipsOffset[2]];
  return out;
}

/** Author a pose for the left side and get both sides symmetric. */
export function symmetric(spec: PoseSpec): PoseSpec {
  const m = mirrorSpec(spec);
  const out: PoseSpec = { ...spec };
  for (const [k, v] of Object.entries(m)) if (!(k in spec)) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Per-bone weight masks. */
export function mask(bones: HumanBone[], weight = 1): Float32Array {
  const m = new Float32Array(N);
  for (const b of bones) m[BONE_INDEX[b]] = weight;
  return m;
}

export const FULL_BODY = mask([...HUMAN_BONES]);
export const UPPER_BODY = mask(['spine', 'chest', 'upperChest', 'neck', 'head', 'shoulderL', 'upperArmL', 'lowerArmL', 'handL', 'shoulderR', 'upperArmR', 'lowerArmR', 'handR']);
export const ARMS = mask(['shoulderL', 'upperArmL', 'lowerArmL', 'handL', 'shoulderR', 'upperArmR', 'lowerArmR', 'handR']);

const _q = new Quaternion();
const _e = new Euler();

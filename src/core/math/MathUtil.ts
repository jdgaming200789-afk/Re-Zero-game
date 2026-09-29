import { MathUtils, Quaternion, Vector3 } from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = MathUtils.clamp;
export const lerp = MathUtils.lerp;
export const inverseLerp = MathUtils.inverseLerp;

export function saturate(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function remap(v: number, a0: number, a1: number, b0: number, b1: number, clampResult = true): number {
  const t = (v - a0) / (a1 - a0);
  return lerp(b0, b1, clampResult ? saturate(t) : t);
}

/**
 * Frame-rate independent exponential smoothing. `halfLife` is the time in
 * seconds for the remaining distance to halve.
 */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(2, -dt / halfLife);
}

export function dampVec3(current: Vector3, target: Vector3, halfLife: number, dt: number): Vector3 {
  if (halfLife <= 0) return current.copy(target);
  const k = 1 - Math.pow(2, -dt / halfLife);
  return current.lerp(target, k);
}

export function dampQuat(current: Quaternion, target: Quaternion, halfLife: number, dt: number): Quaternion {
  if (halfLife <= 0) return current.copy(target);
  const k = 1 - Math.pow(2, -dt / halfLife);
  return current.slerp(target, k);
}

/** Shortest signed difference between two angles (radians), in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function dampAngle(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return current + angleDelta(current, target) * (1 - Math.pow(2, -dt / halfLife));
}

/** Rotates `current` toward `target` by at most `maxStep` radians. */
export function moveTowardsAngle(current: number, target: number, maxStep: number): number {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export function moveTowards(current: number, target: number, maxStep: number): number {
  if (Math.abs(target - current) <= maxStep) return target;
  return current + Math.sign(target - current) * maxStep;
}

/**
 * Critically-damped spring (Unity's SmoothDamp). Stateful velocity lives in
 * the caller so many springs can share this function.
 */
export function smoothDamp(
  current: number,
  target: number,
  velocity: { v: number },
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): number {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  target = current - change;
  const temp = (velocity.v + omega * change) * dt;
  velocity.v = (velocity.v - omega * temp) * exp;
  let output = target + (change + temp) * exp;
  if (originalTo - current > 0 === output > originalTo) {
    output = originalTo;
    velocity.v = (output - originalTo) / dt;
  }
  return output;
}

export class SmoothDampVec3 {
  readonly velocity = new Vector3();
  private readonly vx = { v: 0 };
  private readonly vy = { v: 0 };
  private readonly vz = { v: 0 };

  step(current: Vector3, target: Vector3, smoothTime: number | Vector3, dt: number): Vector3 {
    const tx = typeof smoothTime === 'number' ? smoothTime : smoothTime.x;
    const ty = typeof smoothTime === 'number' ? smoothTime : smoothTime.y;
    const tz = typeof smoothTime === 'number' ? smoothTime : smoothTime.z;
    current.x = smoothDamp(current.x, target.x, this.vx, tx, dt);
    current.y = smoothDamp(current.y, target.y, this.vy, ty, dt);
    current.z = smoothDamp(current.z, target.z, this.vz, tz, dt);
    this.velocity.set(this.vx.v, this.vy.v, this.vz.v);
    return current;
  }

  reset(): void {
    this.vx.v = this.vy.v = this.vz.v = 0;
    this.velocity.set(0, 0, 0);
  }
}

export const Easing = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  smoothstep: (t: number) => t * t * (3 - 2 * t),
} as const;

export type EasingName = keyof typeof Easing;

/** Deterministic PRNG (mulberry32) so procedural content is reproducible. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Approximately normal distribution (sum of uniforms). */
  gaussian(mean = 0, sd = 1): number {
    return mean + sd * (this.next() + this.next() + this.next() + this.next() - 2) * 1.2247;
  }
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Smooth 1D value noise, useful for camera shake and idle sway. */
export function noise1D(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i + seed * 131);
  const b = hash1(i + 1 + seed * 131);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

function hash1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

const _v = new Vector3();
/** Yaw angle (radians) of a direction on the XZ plane, 0 = +Z. */
export function yawOf(dir: Vector3): number {
  return Math.atan2(dir.x, dir.z);
}

export function flatDirection(from: Vector3, to: Vector3, out = new Vector3()): Vector3 {
  out.set(to.x - from.x, 0, to.z - from.z);
  const l = out.length();
  if (l > 1e-6) out.divideScalar(l);
  return out;
}

export function flatDistance(a: Vector3, b: Vector3): number {
  _v.set(a.x - b.x, 0, a.z - b.z);
  return _v.length();
}

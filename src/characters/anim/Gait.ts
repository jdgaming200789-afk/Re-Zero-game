import { clamp, Easing, lerp } from '../../core/math/MathUtil';
import type { LocomotionState } from '../CharacterVisual';
import { Pose, type PoseSpec } from './Pose';

/**
 * Procedural locomotion.
 *
 * Normalised-space conventions (see HumanoidRig):
 *  - limbs hang down at identity; rotX < 0 swings a limb forward, > 0 back
 *  - knees flex with rotX > 0, elbows flex with rotX < 0
 *  - spine/neck/head: rotX > 0 bends forward / looks down; rotY > 0 turns left
 *  - rotZ on an upper arm: + raises the left arm outward (− for the right)
 *
 * A gait cycle is phase 0..1; at 0 the left heel strikes.
 */
export interface GaitStyle {
  /** Step length multiplier (long legs, confident stride). */
  stride: number;
  armSwing: number;
  bounce: number;
  /** Baseline forward lean of the torso (degrees). */
  posture: number;
  /** Rounded shoulders / head forward (Subaru's slouch). */
  slouch: number;
  /** Feminine hip sway. */
  hipSway: number;
  /** Arms held closer and higher (Beatrice's small quick steps, Ram's composure). */
  armsIn: number;
  /** Knee lift in the run. */
  kneeLift: number;
  elbowBase: number;
  /** Cadence multiplier (short legs step faster). */
  cadence: number;
}

export const DEFAULT_GAIT: GaitStyle = {
  stride: 1,
  armSwing: 1,
  bounce: 1,
  posture: 2,
  slouch: 0,
  hipSway: 0,
  armsIn: 0,
  kneeLift: 1,
  elbowBase: 12,
  cadence: 1,
};

const TAU = Math.PI * 2;

function pulse(p: number, center: number, width: number): number {
  // Smooth periodic bump centred at `center` (phase units), width = half-support.
  let d = Math.abs(p - center);
  d = Math.min(d, 1 - d);
  if (d >= width) return 0;
  const t = 1 - d / width;
  return t * t * (3 - 2 * t);
}

export class GaitGenerator {
  phase = 0;
  private readonly walk = new Pose();
  private readonly run = new Pose();
  private readonly out = new Pose();

  constructor(
    public style: GaitStyle,
    private readonly legLength: number,
  ) {}

  /** Advance the cycle from actual ground speed (keeps feet from sliding). */
  advance(dt: number, speed: number): void {
    const runW = clamp((speed - 1.8) / 1.7, 0, 1);
    const step = this.legLength * lerp(0.78, 1.45, runW) * (1 + clamp(speed - 4.2, 0, 2) * 0.12) * this.style.stride;
    const cyclesPerSec = (speed / (2 * step)) * this.style.cadence;
    this.phase = (this.phase + cyclesPerSec * dt) % 1;
  }

  /** Locomotion pose for the current phase and speed. */
  pose(loco: LocomotionState): Pose {
    const speed = loco.speed;
    const runW = clamp((speed - 1.8) / 1.7, 0, 1);
    const sprintW = clamp((speed - 4.4) / 1.4, 0, 1);
    const moveW = clamp(speed / 0.8, 0, 1);
    this.walkPose(this.phase, moveW, this.walk);
    this.runPose(this.phase, sprintW, this.run);
    this.out.blend(this.walk, this.run, runW);
    return this.out;
  }

  private walkPose(p: number, amt: number, out: Pose): void {
    const s = this.style;
    const c = Math.cos(TAU * p);
    const sn = Math.sin(TAU * p);
    const spec: PoseSpec = {};
    const legs = (side: 'L' | 'R', ph: number) => {
      const cc = Math.cos(TAU * ph);
      const thigh = -24 * cc * s.stride;
      const knee = 6 + 8 * pulse(ph, 0.1, 0.12) + 48 * pulse(ph, 0.75, 0.26);
      const toeOff = 18 * pulse(ph, 0.6, 0.1);
      const foot = -(thigh + knee) * 0.75 + toeOff - 8 * pulse(ph, 0.02, 0.06);
      spec[`upperLeg${side}`] = [thigh * amt, 0, 0];
      spec[`lowerLeg${side}`] = [knee * amt, 0, 0];
      spec[`foot${side}`] = [foot * amt, 0, 0];
      spec[`toes${side}`] = [-14 * pulse(ph, 0.6, 0.1) * amt, 0, 0];
    };
    legs('L', p);
    legs('R', (p + 0.5) % 1);
    const armAmp = 16 * s.armSwing * amt * (1 - 0.6 * s.armsIn);
    const elbow = s.elbowBase + 8 * s.armsIn;
    spec.upperArmL = [armAmp * c + 2, 0, 5 + 3 * s.armsIn];
    spec.upperArmR = [-armAmp * c + 2, 0, -5 - 3 * s.armsIn];
    spec.lowerArmL = [-(elbow + 8 * Math.max(0, -c) * amt), 0, 0];
    spec.lowerArmR = [-(elbow + 8 * Math.max(0, c) * amt), 0, 0];
    spec.hips = [s.posture * 0.3, -7 * c * amt, 3 * sn * amt * (1 + s.hipSway)];
    spec.spine = [s.posture * 0.4 + 1.5 * amt, 4 * c * amt, -1.5 * sn * amt];
    spec.chest = [s.posture * 0.3 + s.slouch * 4, 4 * c * amt, 0];
    spec.upperChest = [s.slouch * 4, 0, 0];
    spec.neck = [-s.slouch * 4 - 2 * amt, -3 * c * amt, 0];
    spec.head = [-s.slouch * 2, -2 * c * amt, 0];
    const bob = 0.022 * s.bounce * amt * Math.cos(2 * TAU * (p - 0.25));
    spec.hipsOffset = [0.025 * sn * amt * (1 + s.hipSway * 1.5), bob - 0.012 * amt, 0];
    Pose.fromSpec(spec, out);
  }

  private runPose(p: number, sprint: number, out: Pose): void {
    const s = this.style;
    const c = Math.cos(TAU * p);
    const sn = Math.sin(TAU * p);
    const spec: PoseSpec = {};
    const amp = 1 + sprint * 0.25;
    const legs = (side: 'L' | 'R', ph: number) => {
      const cc = Math.cos(TAU * ph);
      const thigh = -(40 * cc + 8 * pulse(ph, 0.85, 0.2) * s.kneeLift) * s.stride * amp;
      const knee = 22 + 18 * pulse(ph, 0.12, 0.12) + 95 * pulse(ph, 0.72, 0.3) * s.kneeLift * amp;
      const foot = -(thigh + knee) * 0.55 + 25 * pulse(ph, 0.42, 0.12);
      spec[`upperLeg${side}`] = [thigh, 0, 0];
      spec[`lowerLeg${side}`] = [knee, 0, 0];
      spec[`foot${side}`] = [foot, 0, 0];
      spec[`toes${side}`] = [-20 * pulse(ph, 0.42, 0.1), 0, 0];
    };
    legs('L', p);
    legs('R', (p + 0.5) % 1);
    const armAmp = 38 * s.armSwing * amp * (1 - 0.5 * s.armsIn);
    const elbow = 78 + 10 * s.armsIn;
    spec.upperArmL = [armAmp * c - 6, -8, 8 + 4 * s.armsIn];
    spec.upperArmR = [-armAmp * c - 6, 8, -8 - 4 * s.armsIn];
    spec.lowerArmL = [-(elbow - 18 * c), 0, 0];
    spec.lowerArmR = [-(elbow + 18 * c), 0, 0];
    const lean = 10 + 6 * sprint + s.posture;
    spec.hips = [lean * 0.35, -10 * c * amp, 3 * sn];
    spec.spine = [lean * 0.35, 7 * c, 0];
    spec.chest = [lean * 0.3 + s.slouch * 3, 7 * c, 0];
    spec.upperChest = [s.slouch * 3, 0, 0];
    spec.neck = [-lean * 0.45 - s.slouch * 3, -5 * c, 0];
    spec.head = [-lean * 0.35, -4 * c, 0];
    // Runs compress at mid-stance and fly between steps.
    const bob = 0.045 * s.bounce * Math.cos(2 * TAU * (p - 0.3));
    spec.hipsOffset = [0.012 * sn, bob - 0.05, 0];
    Pose.fromSpec(spec, out);
  }
}

/**
 * Standing idle: a character-specific stance plus breathing and slow weight
 * shifts. Exhaustion and fear bend the stance (Subaru is not a soldier).
 */
type Fidget = 'look' | 'shoulders' | 'shift' | 'glance';
const FIDGETS: Fidget[] = ['look', 'shoulders', 'shift', 'glance', 'look'];
const FIDGET_TIME: Record<Fidget, number> = { look: 3.2, shoulders: 1.8, shift: 2.6, glance: 1.8 };

export class IdleGenerator {
  private t = Math.random() * 10;
  /** Occasional small motions while standing (look around, stretch...). */
  private fidget: { kind: Fidget; t: number; side: number } | null = null;
  private nextFidget = 4 + Math.random() * 8;
  private readonly base = new Pose();
  private readonly out = new Pose();
  private readonly tired = new Pose();
  private readonly afraid = new Pose();

  constructor(stance: PoseSpec) {
    this.setStance(stance);
    Pose.fromSpec(
      {
        spine: [14, 0, 0],
        chest: [10, 0, 0],
        neck: [6, 0, 0],
        head: [8, 0, 0],
        upperArmL: [-18, 0, 6],
        upperArmR: [-18, 0, -6],
        lowerArmL: [-20, 0, 0],
        lowerArmR: [-20, 0, 0],
        upperLegL: [-12, 0, 2],
        upperLegR: [-12, 0, -2],
        lowerLegL: [22, 0, 0],
        lowerLegR: [22, 0, 0],
        footL: [-10, 0, 0],
        footR: [-10, 0, 0],
        hipsOffset: [0, -0.06, 0.02],
      },
      this.tired,
    );
    Pose.fromSpec(
      {
        hips: [4, 0, 0],
        spine: [6, 0, 0],
        chest: [6, 0, 0],
        upperChest: [4, 0, 0],
        shoulderL: [0, 0, 6],
        shoulderR: [0, 0, -6],
        neck: [-6, 0, 0],
        head: [4, 0, 0],
        upperArmL: [-14, 0, -3],
        upperArmR: [-14, 0, 3],
        lowerArmL: [-38, 0, 0],
        lowerArmR: [-38, 0, 0],
        upperLegL: [-10, 0, 3],
        upperLegR: [-10, 0, -3],
        lowerLegL: [18, 0, 0],
        lowerLegR: [18, 0, 0],
        footL: [-8, 0, 0],
        footR: [-8, 0, 0],
        hipsOffset: [0, -0.05, 0],
      },
      this.afraid,
    );
  }

  setStance(stance: PoseSpec): void {
    Pose.fromSpec(stance, this.base);
  }

  pose(dt: number, loco: LocomotionState): Pose {
    this.t += dt;
    const t = this.t;
    const breathRate = 0.28 + loco.exhaustion * 0.55 + loco.tension * 0.2;
    const b = Math.sin(t * Math.PI * 2 * breathRate);
    const breathAmp = 1.2 + loco.exhaustion * 3.5;
    this.out.copy(this.base);
    // Fear and exhaustion reshape the stance.
    if (loco.tension > 0.01) this.out.addScaled(this.afraid, loco.tension);
    if (loco.exhaustion > 0.01) this.out.addScaled(this.tired, loco.exhaustion);
    this.out.rotate('chest', -breathAmp * 0.6 * b, 0, 0);
    this.out.rotate('upperChest', -breathAmp * 0.4 * b, 0, 0);
    this.out.rotate('shoulderL', 0, 0, breathAmp * 0.5 * b);
    this.out.rotate('shoulderR', 0, 0, -breathAmp * 0.5 * b);
    // Slow weight shift and a little sway.
    const shift = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.13) * 0.5;
    this.out.hipsOffset.x += shift * 0.012;
    this.out.hipsOffset.y += 0.003 * b;
    this.out.rotate('hips', 0, 0, shift * 1.2);
    this.out.rotate('spine', 0, 0, -shift * 1.0);
    this.out.rotate('lowerLegL', Math.max(0, -shift) * 5, 0, 0);
    this.out.rotate('lowerLegR', Math.max(0, shift) * 5, 0, 0);
    this.out.rotate('head', Math.sin(t * 0.21) * 1.5, Math.sin(t * 0.17) * 3, 0);
    this.applyFidget(dt, loco);
    return this.out;
  }

  private applyFidget(dt: number, loco: LocomotionState): void {
    if (loco.speed > 0.2 || loco.tension > 0.5) {
      this.fidget = null;
      this.nextFidget = Math.max(this.nextFidget, 3);
      return;
    }
    if (!this.fidget) {
      this.nextFidget -= dt;
      if (this.nextFidget > 0) return;
      this.nextFidget = 7 + Math.random() * 9;
      this.fidget = { kind: FIDGETS[Math.floor(Math.random() * FIDGETS.length)]!, t: 0, side: Math.random() < 0.5 ? -1 : 1 };
    }
    const f = this.fidget;
    f.t += dt;
    const dur = FIDGET_TIME[f.kind];
    const u = f.t / dur;
    if (u >= 1) {
      this.fidget = null;
      return;
    }
    // Ease in, hold, ease out.
    const w = u < 0.25 ? Easing.inOutSine(u / 0.25) : u > 0.72 ? Easing.inOutSine((1 - u) / 0.28) : 1;
    const o = this.out;
    switch (f.kind) {
      case 'look': {
        // Look one way, then a beat the other way.
        const s2 = u < 0.5 ? f.side : -f.side * 0.6;
        o.rotate('neck', 0, 9 * s2 * w, 0);
        o.rotate('head', -2 * w, 18 * s2 * w, 0);
        o.rotate('chest', 0, 3 * s2 * w, 0);
        break;
      }
      case 'shoulders':
        o.rotate('upperChest', -5 * w, 0, 0);
        o.rotate('shoulderL', 0, 0, 7 * w);
        o.rotate('shoulderR', 0, 0, -7 * w);
        o.rotate('head', -6 * w, 0, 4 * f.side * w);
        break;
      case 'shift':
        o.hipsOffset.x += 0.025 * f.side * w;
        o.rotate('hips', 0, 0, 3 * f.side * w);
        o.rotate('spine', 0, 0, -2.5 * f.side * w);
        o.rotate(f.side > 0 ? 'lowerLegR' : 'lowerLegL', 9 * w, 0, 0);
        break;
      case 'glance':
        o.rotate('neck', 5 * w, 0, 0);
        o.rotate('head', 10 * w, 6 * f.side * w, 0);
        break;
    }
  }
}

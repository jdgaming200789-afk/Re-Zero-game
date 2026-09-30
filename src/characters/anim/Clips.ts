import { Easing, type EasingName } from '../../core/math/MathUtil';
import { FULL_BODY, Pose, UPPER_BODY, mask, mirrorSpec, symmetric, type PoseSpec } from './Pose';

export interface ClipKey {
  t: number;
  pose: PoseSpec;
  /** Easing used to arrive at this key from the previous one. */
  ease?: EasingName;
}

export interface ActionClip {
  id: string;
  duration: number;
  keys: ClipKey[];
  /** Normalised time (0..1) of the contact / impact event. */
  contact?: number;
  mask: Float32Array;
  /** Base pose influence at the start/end (0 = fully the clip). */
  fadeIn: number;
  fadeOut: number;
  /** Whether locomotion legs keep driving the lower body. */
  additiveLegs?: boolean;
}

export function clip(id: string, duration: number, keys: ClipKey[], opts: Partial<Omit<ActionClip, 'id' | 'duration' | 'keys'>> = {}): ActionClip {
  return { id, duration, keys, mask: opts.mask ?? FULL_BODY, fadeIn: opts.fadeIn ?? 0.15, fadeOut: opts.fadeOut ?? 0.2, contact: opts.contact, additiveLegs: opts.additiveLegs };
}

export const stand: PoseSpec = symmetric({ upperArmL: [2, 0, 4], lowerArmL: [-10, 0, 0] });

/** Interaction / reaction clips shared by all humanoids. */
export const CLIPS: Record<string, ActionClip> = {};
function register(c: ActionClip): void {
  CLIPS[c.id] = c;
}

register(
  clip(
    'reachMid',
    0.9,
    [
      { t: 0, pose: stand },
      { t: 0.35, pose: { ...stand, spine: [8, -6, 0], chest: [4, 0, 0], head: [10, 0, 0], upperArmR: [-68, -10, -6], lowerArmR: [-18, 0, 0], handR: [-10, 0, 0] }, ease: 'outCubic' },
      { t: 0.55, pose: { ...stand, spine: [8, -6, 0], chest: [4, 0, 0], head: [10, 0, 0], upperArmR: [-72, -10, -6], lowerArmR: [-12, 0, 0], handR: [-5, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.45, mask: UPPER_BODY },
  ),
);
register(
  clip(
    'reachLow',
    1.0,
    [
      { t: 0, pose: stand },
      { t: 0.4, pose: { ...stand, hips: [10, 0, 0], spine: [22, -4, 0], chest: [10, 0, 0], head: [14, 0, 0], upperArmR: [-55, -8, -6], lowerArmR: [-10, 0, 0], upperLegL: [-14, 0, 0], upperLegR: [-14, 0, 0], lowerLegL: [24, 0, 0], lowerLegR: [24, 0, 0], footL: [-10, 0, 0], footR: [-10, 0, 0], hipsOffset: [0, -0.1, -0.03] }, ease: 'outCubic' },
      { t: 0.6, pose: { ...stand, hips: [10, 0, 0], spine: [22, -4, 0], chest: [10, 0, 0], head: [14, 0, 0], upperArmR: [-58, -8, -6], lowerArmR: [-6, 0, 0], upperLegL: [-14, 0, 0], upperLegR: [-14, 0, 0], lowerLegL: [24, 0, 0], lowerLegR: [24, 0, 0], footL: [-10, 0, 0], footR: [-10, 0, 0], hipsOffset: [0, -0.1, -0.03] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.5 },
  ),
);
const crouch: PoseSpec = {
  hips: [18, 0, 0],
  spine: [24, 0, 0],
  chest: [12, 0, 0],
  head: [18, 0, 0],
  upperLegL: [-72, 0, 8],
  upperLegR: [-40, 0, -6],
  lowerLegL: [108, 0, 0],
  lowerLegR: [96, 0, 0],
  footL: [-30, 0, 0],
  footR: [10, 0, 0],
  upperArmL: [-30, 0, 8],
  lowerArmL: [-40, 0, 0],
  upperArmR: [-40, -6, -8],
  lowerArmR: [-12, 0, 0],
  hipsOffset: [0, -0.42, -0.04],
};
register(
  clip(
    'pickupGround',
    1.25,
    [
      { t: 0, pose: stand },
      { t: 0.42, pose: crouch, ease: 'inOutCubic' },
      { t: 0.58, pose: { ...crouch, upperArmR: [-46, -6, -8], lowerArmR: [-30, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.5 },
  ),
);
const kneel: PoseSpec = {
  hips: [8, 0, 0],
  spine: [16, 0, 0],
  chest: [8, 0, 0],
  head: [22, 0, 0],
  upperLegL: [-86, 0, 6],
  lowerLegL: [92, 0, 0],
  footL: [-6, 0, 0],
  upperLegR: [-2, 0, -4],
  lowerLegR: [118, 0, 0],
  footR: [50, 0, 0],
  toesR: [-50, 0, 0],
  upperArmL: [-40, 0, 6],
  lowerArmL: [-50, 0, 0],
  upperArmR: [-52, -10, -6],
  lowerArmR: [-20, 0, 0],
  hipsOffset: [0, -0.5, -0.05],
};
register(
  clip(
    'kneelInspect',
    2.0,
    [
      { t: 0, pose: stand },
      { t: 0.28, pose: kneel, ease: 'inOutCubic' },
      { t: 0.5, pose: { ...kneel, upperArmR: [-58, -12, -4], lowerArmR: [-10, 0, 0], head: [26, -6, 0] } },
      { t: 0.72, pose: kneel },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.45 },
  ),
);
register(
  clip(
    'pushDoor',
    1.1,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, spine: [6, 0, 0], upperArmL: [-70, 6, 8], upperArmR: [-70, -6, -8], lowerArmL: [-40, 0, 0], lowerArmR: [-40, 0, 0] }, ease: 'outCubic' },
      { t: 0.55, pose: { ...stand, spine: [14, 0, 0], upperLegL: [-12, 0, 0], lowerLegL: [10, 0, 0], upperLegR: [12, 0, 0], upperArmL: [-82, 6, 8], upperArmR: [-82, -6, -8], lowerArmL: [-12, 0, 0], lowerArmR: [-12, 0, 0], hipsOffset: [0, -0.02, 0.08] }, ease: 'inOutQuad' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.5 },
  ),
);
register(
  clip(
    'pullLever',
    1.3,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, spine: [16, 0, 0], upperArmL: [-60, 4, 6], upperArmR: [-62, -4, -6], lowerArmL: [-30, 0, 0], lowerArmR: [-30, 0, 0] }, ease: 'outCubic' },
      { t: 0.6, pose: { ...stand, spine: [-4, 0, 0], hips: [-6, 0, 0], upperLegL: [-10, 0, 0], lowerLegL: [16, 0, 0], upperArmL: [-30, 4, 6], upperArmR: [-32, -4, -6], lowerArmL: [-70, 0, 0], lowerArmR: [-70, 0, 0], hipsOffset: [0, -0.04, -0.06] }, ease: 'inOutQuad' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.55 },
  ),
);
const reading: PoseSpec = { ...stand, spine: [6, 0, 0], neck: [10, 0, 0], head: [18, 0, 0], upperArmL: [-38, 10, 10], upperArmR: [-38, -10, -10], lowerArmL: [-78, 0, 0], lowerArmR: [-78, 0, 0], handL: [0, 0, 20], handR: [0, 0, -20] };
register(
  clip(
    'readBook',
    1.6,
    [
      { t: 0, pose: stand },
      { t: 0.25, pose: { ...stand, spine: [10, 0, 0], head: [14, 0, 0], upperArmR: [-60, -6, -6], lowerArmR: [-20, 0, 0] }, ease: 'outCubic' },
      { t: 0.45, pose: reading, ease: 'inOutCubic' },
      { t: 0.85, pose: { ...reading, head: [20, 3, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.3, mask: UPPER_BODY },
  ),
);
register(
  clip(
    'touch',
    0.9,
    [
      { t: 0, pose: stand },
      { t: 0.4, pose: { ...stand, spine: [6, -4, 0], head: [6, 0, 0], upperArmR: [-62, -14, -4], lowerArmR: [-8, 0, 0], handR: [-30, 0, 0] }, ease: 'outCubic' },
      { t: 0.6, pose: { ...stand, spine: [6, -4, 0], head: [6, 0, 0], upperArmR: [-64, -14, -4], lowerArmR: [-6, 0, 0], handR: [-34, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.45, mask: UPPER_BODY },
  ),
);
register(
  clip(
    'talk',
    1.2,
    [
      { t: 0, pose: stand },
      { t: 0.35, pose: { ...stand, head: [-2, 0, 3], upperArmR: [-30, -10, -8], lowerArmR: [-70, 0, 0], handR: [0, 0, -20] }, ease: 'outCubic' },
      { t: 0.7, pose: { ...stand, head: [2, 0, -2], upperArmR: [-26, -12, -8], lowerArmR: [-64, 0, 0], handR: [0, 0, -10] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.3, mask: UPPER_BODY },
  ),
);
register(
  clip(
    'jump',
    0.45,
    [
      { t: 0, pose: stand },
      { t: 0.4, pose: symmetric({ spine: [-4, 0, 0], upperArmL: [-40, 0, 20], lowerArmL: [-30, 0, 0], upperLegL: [-30, 0, 0], lowerLegL: [50, 0, 0] }), ease: 'outCubic' },
      { t: 1, pose: symmetric({ upperArmL: [-20, 0, 25], lowerArmL: [-30, 0, 0], upperLegL: [-20, 0, 0], lowerLegL: [40, 0, 0] }) },
    ],
    { fadeOut: 0.3 },
  ),
);
register(
  clip(
    'landSoft',
    0.35,
    [
      { t: 0, pose: symmetric({ upperLegL: [-22, 0, 0], lowerLegL: [40, 0, 0], footL: [-16, 0, 0], spine: [10, 0, 0], hipsOffset: [0, -0.1, 0] }) },
      { t: 1, pose: stand, ease: 'outCubic' },
    ],
    { fadeIn: 0.02, fadeOut: 0.15 },
  ),
);
register(
  clip(
    'landHard',
    0.8,
    [
      { t: 0, pose: symmetric({ upperLegL: [-50, 0, 4], lowerLegL: [90, 0, 0], footL: [-38, 0, 0], spine: [26, 0, 0], chest: [10, 0, 0], head: [10, 0, 0], upperArmL: [-40, 0, 20], lowerArmL: [-30, 0, 0], hipsOffset: [0, -0.32, 0] }) },
      { t: 0.5, pose: symmetric({ upperLegL: [-40, 0, 4], lowerLegL: [72, 0, 0], footL: [-30, 0, 0], spine: [20, 0, 0], head: [6, 0, 0], upperArmL: [-30, 0, 16], lowerArmL: [-30, 0, 0], hipsOffset: [0, -0.24, 0] }), ease: 'outQuad' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { fadeIn: 0.02, fadeOut: 0.2 },
  ),
);
register(
  clip(
    'flinch',
    0.5,
    [
      { t: 0, pose: stand },
      { t: 0.2, pose: { ...stand, spine: [-8, 6, 0], chest: [-6, 4, 0], head: [-10, 10, 0], upperArmL: [-40, 0, 20], lowerArmL: [-90, 0, 0], upperArmR: [-40, 0, -20], lowerArmR: [-90, 0, 0] }, ease: 'outExpo' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { fadeIn: 0.03, mask: UPPER_BODY },
  ),
);
register(
  clip(
    'lookAround',
    3.2,
    [
      { t: 0, pose: stand },
      { t: 0.25, pose: { ...stand, neck: [-4, 20, 0], head: [-6, 25, 0], chest: [0, 8, 0] }, ease: 'inOutSine' },
      { t: 0.45, pose: { ...stand, neck: [-4, 20, 0], head: [-6, 25, 0], chest: [0, 8, 0] } },
      { t: 0.7, pose: { ...stand, neck: [-2, -20, 0], head: [-4, -28, 0], chest: [0, -8, 0] }, ease: 'inOutSine' },
      { t: 0.85, pose: { ...stand, neck: [-2, -20, 0], head: [-4, -28, 0], chest: [0, -8, 0] } },
      { t: 1, pose: stand, ease: 'inOutSine' },
    ],
    { mask: mask(['spine', 'chest', 'upperChest', 'neck', 'head']) },
  ),
);

export { mirrorSpec };

/** Sample a clip at normalised time u (0..1) into `out`. */
export function sampleClip(c: ActionClip, u: number, out: Pose, tmpA: Pose, tmpB: Pose): Pose {
  const keys = c.keys;
  if (u <= keys[0]!.t) return Pose.fromSpec(keys[0]!.pose, out);
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i]!;
    if (u <= k.t) {
      const prev = keys[i - 1]!;
      const local = (u - prev.t) / Math.max(1e-5, k.t - prev.t);
      const e = Easing[k.ease ?? 'inOutSine'](local);
      Pose.fromSpec(prev.pose, tmpA);
      Pose.fromSpec(k.pose, tmpB);
      return out.blend(tmpA, tmpB, e);
    }
  }
  return Pose.fromSpec(keys[keys.length - 1]!.pose, out);
}

/** Per-character idle stances (the way each of them stands still). */
export const STANCES: Record<string, PoseSpec> = {
  neutral: symmetric({ upperArmL: [2, 0, 5], lowerArmL: [-12, 0, 0], handL: [0, 0, 6] }),
  // Subaru: loose, a little slouched, weight on one leg.
  subaru: {
    ...symmetric({ upperArmL: [3, 0, 6], lowerArmL: [-14, 0, 0] }),
    hips: [0, 0, 3],
    spine: [3, 0, -2],
    upperChest: [4, 0, 0],
    neck: [-3, 0, 0],
    upperLegR: [-4, 0, -2],
    lowerLegR: [8, 0, 0],
    hipsOffset: [0.012, -0.004, 0],
  },
  // Emilia: upright, hands lightly clasped in front.
  // (Arm twist: rotY < 0 on the left arm turns the elbow's flex plane inwards.)
  emilia: { ...symmetric({ upperArmL: [-12, -34, -6], lowerArmL: [-62, 0, 0], handL: [0, 0, -12] }), spine: [-1, 0, 0] },
  // Beatrice: arms folded, chin up — "I suppose."
  beatrice: { ...symmetric({ upperArmL: [-26, -58, 10], lowerArmL: [-116, 0, 0], handL: [0, 0, 8] }), neck: [-4, 0, 0], head: [-6, 0, 0], spine: [-3, 0, 0] },
  // Julius: parade-ground upright; left hand resting on the sword hilt.
  julius: { upperArmL: [6, -22, 12], lowerArmL: [-58, 0, 0], handL: [0, 0, 10], upperArmR: [2, 0, -4], lowerArmR: [-8, 0, 0], spine: [-2, 0, 0], neck: [-2, 0, 0] },
  // Ram: composed maid posture, hands folded at the apron.
  ram: { ...symmetric({ upperArmL: [-10, -32, -8], lowerArmL: [-68, 0, 0], handL: [0, 0, -14] }), head: [-4, 0, 0] },
  // Meili: hands behind the back, swaying.
  meili: { ...symmetric({ upperArmL: [18, -80, 4], lowerArmL: [-72, 0, 0] }), spine: [-2, 0, 0] },
  // Anastasia: one hand at the scarf, thinking.
  anastasia: { upperArmL: [-18, -42, -4], lowerArmL: [-122, 0, 0], handL: [0, 0, 0], upperArmR: [0, 0, -4], lowerArmR: [-20, 0, 0] },
  // Shaula: hand on the cocked hip, bouncing with energy.
  shaula: { upperArmL: [6, -72, 36], lowerArmL: [-92, 0, 0], handL: [0, 0, -14], upperArmR: [-4, 0, -8], lowerArmR: [-16, 0, 0], hips: [0, 0, -5], spine: [-1, 0, 4], upperLegL: [-4, 0, 3], lowerLegL: [9, 0, 0], hipsOffset: [-0.02, -0.004, 0] },
  // Reid: a lazy slouch, weight on one leg, a hand on his hip — and the
  // other up by his shoulder, twirling a pair of chopsticks.
  reid: { upperArmL: [6, -60, 34], lowerArmL: [-90, 0, 0], handL: [0, 0, -12], upperArmR: [-22, 12, -10], lowerArmR: [-104, 0, 0], handR: [0, 0, 10], hips: [0, 0, 4], spine: [4, 0, -3], neck: [-2, 0, 4], head: [-4, 0, 6], upperLegR: [-5, 0, -3], lowerLegR: [10, 0, 0], hipsOffset: [0.02, -0.006, 0] },
  // At rest (lying in bed / unconscious): everything slack and straight.
  rest: { ...symmetric({ upperArmL: [0, 0, 4], lowerArmL: [-6, 0, 0], handL: [0, 0, 4] }), neck: [0, 0, 0], head: [0, 0, 0] },
};

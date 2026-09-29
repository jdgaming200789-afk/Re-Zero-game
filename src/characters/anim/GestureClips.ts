// Keyframe swings stay under 180° between keys: poses become quaternions
// and slerp takes the short way round.
import { CLIPS, clip, stand, type ActionClip } from './Clips';
import { UPPER_BODY, mask, mirrorSpec, type PoseSpec } from './Pose';

/**
 * Conversation gestures, played on the dialogue line they belong to
 * (`anim: 'nod'`). Upper body only, so characters keep their footing.
 * Conventions as in Gait.ts: limbs rotX < 0 swing forward, elbows flex
 * rotX < 0, upper-arm rotZ raises outward (+ left, − right), head rotX > 0
 * looks down, rotY > 0 turns left.
 */
function add(c: ActionClip): void {
  CLIPS[c.id] = c;
}

const HEAD = mask(['neck', 'head']);
const HEAD_CHEST = mask(['spine', 'chest', 'upperChest', 'neck', 'head']);
/** Right-arm pose from a left-arm authoring. */
const right = (spec: PoseSpec): PoseSpec => mirrorSpec(spec);

add(
  clip(
    'nod',
    0.8,
    [
      { t: 0, pose: {} },
      { t: 0.28, pose: { neck: [6, 0, 0], head: [12, 0, 0] }, ease: 'outCubic' },
      { t: 0.52, pose: { neck: [1, 0, 0], head: [1, 0, 0] }, ease: 'inOutSine' },
      { t: 0.72, pose: { neck: [3, 0, 0], head: [6, 0, 0] }, ease: 'inOutSine' },
      { t: 1, pose: {}, ease: 'inOutSine' },
    ],
    { mask: HEAD, fadeIn: 0.1, fadeOut: 0.15 },
  ),
);

add(
  clip(
    'shakeHead',
    1,
    [
      { t: 0, pose: {} },
      { t: 0.22, pose: { neck: [2, 8, 0], head: [4, 14, 0] }, ease: 'outQuad' },
      { t: 0.48, pose: { neck: [2, -8, 0], head: [4, -15, 0] }, ease: 'inOutSine' },
      { t: 0.72, pose: { neck: [2, 5, 0], head: [4, 9, 0] }, ease: 'inOutSine' },
      { t: 1, pose: {}, ease: 'inOutSine' },
    ],
    { mask: HEAD, fadeIn: 0.1, fadeOut: 0.15 },
  ),
);

const shrugPose: PoseSpec = {
  ...stand,
  chest: [-3, 0, 0],
  head: [0, 0, 7],
  upperArmL: [-14, -8, 16],
  lowerArmL: [-72, 0, 0],
  handL: [-8, 0, 34],
  ...right({ upperArmL: [-14, -8, 16], lowerArmL: [-72, 0, 0], handL: [-8, 0, 34] }),
};
add(
  clip(
    'shrug',
    1.3,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: shrugPose, ease: 'outCubic' },
      { t: 0.65, pose: { ...shrugPose, head: [2, 0, 9] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { mask: UPPER_BODY },
  ),
);

const bowPose: PoseSpec = { ...stand, spine: [16, 0, 0], chest: [10, 0, 0], neck: [6, 0, 0], head: [10, 0, 0] };
add(
  clip(
    'bow',
    1.8,
    [
      { t: 0, pose: stand },
      { t: 0.35, pose: bowPose, ease: 'inOutCubic' },
      { t: 0.6, pose: bowPose },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { mask: UPPER_BODY },
  ),
);

/** Knight's salute: right hand over the heart, a shallow bow. */
const heartR = right({ upperArmL: [-30, -54, 8], lowerArmL: [-118, 0, 0], handL: [0, 0, 12] });
add(
  clip(
    'handOnChest',
    1.8,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, ...heartR }, ease: 'outCubic' },
      { t: 0.5, pose: { ...stand, ...heartR, spine: [8, 0, 0], head: [8, 0, 0] }, ease: 'inOutSine' },
      { t: 0.78, pose: { ...stand, ...heartR, spine: [2, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { mask: UPPER_BODY },
  ),
);

/** Hand to chin, the other arm across the waist. */
const thinkPose: PoseSpec = {
  ...stand,
  head: [8, -6, 6],
  ...right({ upperArmL: [-22, -40, 4], lowerArmL: [-138, 0, 0], handL: [24, 0, 0] }),
  upperArmL: [-12, -42, -2],
  lowerArmL: [-84, 0, 0],
  handL: [0, 0, 6],
};
add(
  clip(
    'think',
    2.4,
    [
      { t: 0, pose: stand },
      { t: 0.22, pose: thinkPose, ease: 'outCubic' },
      { t: 0.75, pose: { ...thinkPose, head: [10, 4, 4] }, ease: 'inOutSine' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { mask: UPPER_BODY },
  ),
);

/** Subaru's signature: palm to the face. */
const palmPose: PoseSpec = { ...stand, spine: [6, 0, 0], neck: [6, 0, 0], head: [16, 0, 0], ...right({ upperArmL: [-52, -30, 6], lowerArmL: [-128, 0, 0], handL: [10, 0, 10] }) };
add(
  clip(
    'facepalm',
    1.6,
    [
      { t: 0, pose: stand },
      { t: 0.25, pose: palmPose, ease: 'outCubic' },
      { t: 0.7, pose: { ...palmPose, head: [18, 4, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { mask: UPPER_BODY },
  ),
);

const waveUp = right({ upperArmL: [-40, 0, 72], lowerArmL: [-70, 0, 0], handL: [0, 0, -6] });
const waveOut = right({ upperArmL: [-40, 0, 82], lowerArmL: [-58, 0, 0], handL: [0, 0, 14] });
add(
  clip(
    'wave',
    1.5,
    [
      { t: 0, pose: stand },
      { t: 0.22, pose: { ...stand, ...waveUp }, ease: 'outCubic' },
      { t: 0.38, pose: { ...stand, ...waveOut }, ease: 'inOutSine' },
      { t: 0.54, pose: { ...stand, ...waveUp }, ease: 'inOutSine' },
      { t: 0.7, pose: { ...stand, ...waveOut }, ease: 'inOutSine' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { mask: UPPER_BODY },
  ),
);

add(
  clip(
    'sigh',
    1.7,
    [
      { t: 0, pose: {} },
      { t: 0.3, pose: { spine: [-2, 0, 0], chest: [-4, 0, 0], head: [-6, 0, 0] }, ease: 'outQuad' },
      { t: 0.7, pose: { spine: [5, 0, 0], chest: [6, 0, 0], neck: [4, 0, 0], head: [12, 0, 0] }, ease: 'inOutSine' },
      { t: 1, pose: {}, ease: 'inOutSine' },
    ],
    { mask: HEAD_CHEST },
  ),
);

add(
  clip(
    'lookDown',
    2.2,
    [
      { t: 0, pose: {} },
      { t: 0.25, pose: { neck: [8, 0, 0], head: [18, 0, 0], chest: [4, 0, 0] }, ease: 'outCubic' },
      { t: 0.8, pose: { neck: [8, 0, 0], head: [20, 3, 0], chest: [4, 0, 0] } },
      { t: 1, pose: {}, ease: 'inOutSine' },
    ],
    { mask: HEAD_CHEST, fadeIn: 0.2, fadeOut: 0.3 },
  ),
);

add(
  clip(
    'laugh',
    1.4,
    [
      { t: 0, pose: {} },
      { t: 0.2, pose: { chest: [-5, 0, 0], neck: [-4, 0, 0], head: [-8, 0, 3] }, ease: 'outCubic' },
      { t: 0.4, pose: { chest: [-2, 0, 0], head: [-3, 0, 2] }, ease: 'inOutSine' },
      { t: 0.6, pose: { chest: [-5, 0, 0], neck: [-4, 0, 0], head: [-8, 0, 3] }, ease: 'inOutSine' },
      { t: 1, pose: {}, ease: 'inOutSine' },
    ],
    { mask: HEAD_CHEST },
  ),
);

/** A clenched fist raised in front of the chest: resolve. */
const fistPose: PoseSpec = { ...stand, chest: [-2, 0, 0], ...right({ upperArmL: [-40, -26, 10], lowerArmL: [-104, 0, 0], handL: [-10, 0, 0] }) };
add(
  clip(
    'fist',
    1.5,
    [
      { t: 0, pose: stand },
      { t: 0.25, pose: fistPose, ease: 'outBack' },
      { t: 0.75, pose: fistPose },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { mask: UPPER_BODY },
  ),
);

/** Open-palmed explaining gesture. */
const explainPose: PoseSpec = { ...stand, ...right({ upperArmL: [-34, -12, 14], lowerArmL: [-62, 0, 0], handL: [-6, 0, 26] }) };
add(
  clip(
    'explain',
    1.6,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: explainPose, ease: 'outCubic' },
      { t: 0.55, pose: { ...explainPose, ...right({ upperArmL: [-30, -8, 18], lowerArmL: [-58, 0, 0], handL: [-4, 0, 30] }) }, ease: 'inOutSine' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { mask: UPPER_BODY },
  ),
);

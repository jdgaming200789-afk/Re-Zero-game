// Keyframe swings stay under 180° between keys: poses become quaternions
// and slerp takes the short way round.
import { CLIPS, clip, stand, type ActionClip } from './Clips';
import { UPPER_BODY, symmetric, type PoseSpec } from './Pose';

/**
 * Combat clips (normalised humanoid space; see Gait.ts for conventions:
 * limbs rotX < 0 swing forward, elbows flex rotX < 0, knees rotX > 0,
 * spine rotY > 0 turns left, upper-arm rotZ raises outward: + left, − right).
 */
function add(c: ActionClip): void {
  CLIPS[c.id] = c;
}

const lungeL: PoseSpec = { upperLegL: [-22, 0, 0], lowerLegL: [20, 0, 0], footL: [4, 0, 0], upperLegR: [12, 0, 0], lowerLegR: [10, 0, 0], hipsOffset: [0, -0.05, 0.06] };
const brace: PoseSpec = { upperLegL: [-12, 0, 4], lowerLegL: [18, 0, 0], upperLegR: [-4, 0, -4], lowerLegR: [14, 0, 0], hipsOffset: [0, -0.06, 0] };

// ------------------------------------------------------------------ Subaru: whip
add(
  clip(
    'whip1',
    0.62,
    [
      { t: 0, pose: stand },
      { t: 0.32, pose: { ...stand, ...brace, spine: [-4, -22, 0], chest: [-4, -14, 0], upperArmR: [-176, -20, -18], lowerArmR: [-70, 0, 0], handR: [-20, 0, 0], upperArmL: [-30, 0, 20], lowerArmL: [-50, 0, 0] }, ease: 'outCubic' },
      { t: 0.46, pose: { ...stand, ...lungeL, spine: [10, 18, 0], chest: [6, 14, 0], upperArmR: [-72, 10, -12], lowerArmR: [-6, 0, 0], handR: [10, 0, 0], upperArmL: [-10, 0, 25], lowerArmL: [-40, 0, 0] }, ease: 'inQuad' },
      { t: 0.72, pose: { ...stand, ...lungeL, spine: [8, 12, 0], upperArmR: [-25, 20, 8], lowerArmR: [-18, 0, 0] }, ease: 'outCubic' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.46, fadeIn: 0.06, fadeOut: 0.18, additiveLegs: false },
  ),
);
add(
  clip(
    'whip2',
    0.6,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, ...brace, spine: [0, -28, 0], chest: [0, -16, 0], upperArmR: [-30, 0, -88], lowerArmR: [-45, 0, 0], upperArmL: [-40, 0, 30], lowerArmL: [-60, 0, 0] }, ease: 'outCubic' },
      { t: 0.46, pose: { ...stand, ...lungeL, spine: [4, 22, 0], chest: [2, 14, 0], upperArmR: [-95, 0, 12], lowerArmR: [-4, 0, 0], upperArmL: [-10, 0, 20] }, ease: 'inQuad' },
      { t: 0.72, pose: { ...stand, ...lungeL, spine: [4, 30, 0], upperArmR: [-80, 0, 42], lowerArmR: [-35, 0, 0] }, ease: 'outCubic' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.46, fadeIn: 0.05, fadeOut: 0.18 },
  ),
);
add(
  clip(
    'whip3',
    0.85,
    [
      { t: 0, pose: stand },
      { t: 0.38, pose: { ...stand, ...brace, hips: [-6, 0, 0], spine: [-12, -26, 0], chest: [-8, -12, 0], head: [-8, 0, 0], upperArmR: [-178, -10, -25], lowerArmR: [-80, 0, 0], upperArmL: [-60, 0, 35], lowerArmL: [-40, 0, 0] }, ease: 'outCubic' },
      { t: 0.52, pose: { ...stand, ...lungeL, hips: [12, 0, 0], spine: [18, 16, 0], chest: [10, 10, 0], head: [6, 0, 0], upperArmR: [-55, 10, -8], lowerArmR: [0, 0, 0], handR: [15, 0, 0], upperArmL: [0, 0, 30] }, ease: 'inCubic' },
      { t: 0.75, pose: { ...stand, ...lungeL, hips: [10, 0, 0], spine: [14, 10, 0], upperArmR: [-15, 15, 8], lowerArmR: [-10, 0, 0] }, ease: 'outCubic' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.52, fadeIn: 0.06, fadeOut: 0.2 },
  ),
);
add(
  clip(
    'whipSnare',
    0.75,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, ...brace, spine: [-2, -15, 0], upperArmR: [-120, 0, -30], lowerArmR: [-60, 0, 0] }, ease: 'outCubic' },
      { t: 0.42, pose: { ...stand, ...lungeL, spine: [6, 10, 0], upperArmR: [-92, 0, -4], lowerArmR: [0, 0, 0] }, ease: 'inQuad' },
      { t: 0.7, pose: { ...stand, ...brace, spine: [-8, 0, 0], upperArmR: [-40, 0, -10], lowerArmR: [-100, 0, 0] }, ease: 'outBack' },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.42, fadeIn: 0.06 },
  ),
);

// ------------------------------------------------------------------ evasion / reactions
add(
  clip(
    'dodge',
    0.6,
    [
      { t: 0, pose: stand },
      {
        t: 0.2,
        pose: { ...symmetric({ upperArmL: [-45, 0, 25], lowerArmL: [-70, 0, 0], upperLegL: [-55, 0, 6], lowerLegL: [85, 0, 0], footL: [-20, 0, 0] }), hips: [26, 0, 0], spine: [18, 0, 0], chest: [10, 0, 0], head: [-10, 0, 0], hipsOffset: [0, -0.32, 0.05] },
        ease: 'outCubic',
      },
      { t: 0.55, pose: { ...symmetric({ upperArmL: [-25, 0, 20], lowerArmL: [-50, 0, 0], upperLegL: [-35, 0, 5], lowerLegL: [55, 0, 0], footL: [-15, 0, 0] }), hips: [14, 0, 0], spine: [10, 0, 0], hipsOffset: [0, -0.18, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { fadeIn: 0.04, fadeOut: 0.2 },
  ),
);
add(
  clip(
    'stagger',
    0.85,
    [
      { t: 0, pose: stand },
      { t: 0.18, pose: { ...stand, hips: [-8, 0, 4], spine: [-18, 10, 0], chest: [-10, 6, 0], neck: [-12, 0, 0], head: [-10, 12, 0], upperArmL: [-10, 0, 45], lowerArmL: [-40, 0, 0], upperArmR: [-20, 0, -40], lowerArmR: [-50, 0, 0], upperLegL: [12, 0, 0], lowerLegL: [20, 0, 0], upperLegR: [-18, 0, 0], lowerLegR: [30, 0, 0], hipsOffset: [0, -0.06, -0.12] }, ease: 'outExpo' },
      { t: 0.55, pose: { ...stand, spine: [8, 0, 0], head: [6, 0, 0], upperLegL: [-10, 0, 0], lowerLegL: [20, 0, 0], hipsOffset: [0, -0.05, -0.08] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { fadeIn: 0.03 },
  ),
);
add(
  clip(
    'collapse',
    1.4,
    [
      { t: 0, pose: stand },
      { t: 0.35, pose: { ...symmetric({ upperArmL: [-10, 0, 10], lowerArmL: [-30, 0, 0], upperLegL: [-70, 0, 4], lowerLegL: [110, 0, 0], footL: [30, 0, 0] }), hips: [10, 0, 0], spine: [30, 0, 0], chest: [15, 0, 0], neck: [15, 0, 0], head: [20, 0, 0], hipsOffset: [0, -0.5, -0.05] }, ease: 'inQuad' },
      { t: 1, pose: { ...symmetric({ upperArmL: [-20, 0, 8], lowerArmL: [-20, 0, 0], upperLegL: [-85, 0, 4], lowerLegL: [140, 0, 0], footL: [45, 0, 0] }), hips: [30, 0, 0], spine: [40, 0, 0], chest: [20, 0, 0], neck: [20, 0, 0], head: [25, 0, 0], hipsOffset: [0, -0.62, 0.05] }, ease: 'outCubic' },
    ],
    { fadeIn: 0.05, fadeOut: 0.4 },
  ),
);

// ------------------------------------------------------------------ Subaru + Beatrice magic, items, orders
add(
  clip(
    'castShamak',
    0.95,
    [
      { t: 0, pose: stand },
      { t: 0.25, pose: { ...stand, ...brace, spine: [-4, -10, 0], upperArmR: [-40, 0, -20], lowerArmR: [-110, 0, 0], handR: [0, 0, 0] }, ease: 'outCubic' },
      { t: 0.42, pose: { ...stand, ...lungeL, spine: [6, 8, 0], upperArmR: [-92, 0, -6], lowerArmR: [-4, 0, 0], handR: [-30, 0, 0], head: [-4, 0, 0] }, ease: 'outExpo' },
      { t: 0.8, pose: { ...stand, ...lungeL, spine: [4, 6, 0], upperArmR: [-88, 0, -6], lowerArmR: [-6, 0, 0], handR: [-30, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.42, fadeIn: 0.06 },
  ),
);
add(
  clip(
    'barrier',
    1.25,
    [
      { t: 0, pose: stand },
      { t: 0.15, pose: { ...symmetric({ upperArmL: [-75, -45, -18], lowerArmL: [-112, 0, 0], handL: [0, 0, 10] }), ...brace, spine: [10, 0, 0], head: [8, 0, 0] }, ease: 'outExpo' },
      { t: 0.85, pose: { ...symmetric({ upperArmL: [-75, -45, -18], lowerArmL: [-112, 0, 0], handL: [0, 0, 10] }), ...brace, spine: [10, 0, 0], head: [8, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.15, fadeIn: 0.03 },
  ),
);
add(
  clip(
    'drink',
    1.2,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, upperArmR: [-45, 35, -10], lowerArmR: [-135, 0, 0], handR: [0, 0, 20], head: [4, 0, 0] }, ease: 'outCubic' },
      { t: 0.55, pose: { ...stand, upperArmR: [-55, 35, -15], lowerArmR: [-145, 0, 0], handR: [-20, 0, 20], neck: [-12, 0, 0], head: [-18, 0, 0] } },
      { t: 0.8, pose: { ...stand, upperArmR: [-40, 30, -10], lowerArmR: [-120, 0, 0], head: [4, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.55, mask: UPPER_BODY },
  ),
);
add(
  clip(
    'command',
    0.8,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, spine: [2, 10, 0], upperArmR: [-96, 0, -4], lowerArmR: [-2, 0, 0], handR: [-10, 0, 0] }, ease: 'outBack' },
      { t: 0.7, pose: { ...stand, spine: [2, 10, 0], upperArmR: [-94, 0, -4], lowerArmR: [-4, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.3, mask: UPPER_BODY },
  ),
);

// ------------------------------------------------------------------ Emilia: ice arts
add(
  clip(
    'castForward',
    0.85,
    [
      { t: 0, pose: stand },
      { t: 0.25, pose: { ...symmetric({ upperArmL: [-25, -20, 18], lowerArmL: [-95, 0, 0] }), ...brace, spine: [-4, 0, 0] }, ease: 'outCubic' },
      { t: 0.45, pose: { ...symmetric({ upperArmL: [-88, -10, 10], lowerArmL: [-6, 0, 0], handL: [-35, 0, 0] }), ...lungeL, spine: [6, 0, 0], head: [-2, 0, 0] }, ease: 'outExpo' },
      { t: 0.75, pose: { ...symmetric({ upperArmL: [-80, -10, 10], lowerArmL: [-12, 0, 0], handL: [-30, 0, 0] }), ...lungeL, spine: [4, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.45, fadeIn: 0.08 },
  ),
);
add(
  clip(
    'castRaise',
    1.15,
    [
      { t: 0, pose: stand },
      { t: 0.4, pose: { ...symmetric({ upperArmL: [-172, 0, 22], lowerArmL: [-20, 0, 0], handL: [-10, 0, 0] }), hips: [-4, 0, 0], spine: [-10, 0, 0], head: [-14, 0, 0], hipsOffset: [0, 0.02, 0] }, ease: 'outCubic' },
      { t: 0.58, pose: { ...symmetric({ upperArmL: [-55, 0, 30], lowerArmL: [-10, 0, 0], handL: [30, 0, 0], upperLegL: [-40, 0, 8], lowerLegL: [70, 0, 0] }), hips: [18, 0, 0], spine: [14, 0, 0], head: [10, 0, 0], hipsOffset: [0, -0.28, 0] }, ease: 'inCubic' },
      { t: 0.85, pose: { ...symmetric({ upperArmL: [-45, 0, 30], lowerArmL: [-15, 0, 0], upperLegL: [-35, 0, 8], lowerLegL: [60, 0, 0] }), hips: [15, 0, 0], spine: [12, 0, 0], hipsOffset: [0, -0.24, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.58, fadeIn: 0.08 },
  ),
);
add(
  clip(
    'iceSlash',
    0.62,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, ...brace, spine: [0, -30, 0], chest: [0, -15, 0], upperArmR: [-40, 0, -85], lowerArmR: [-30, 0, 0], upperArmL: [-40, 0, 30], lowerArmL: [-70, 0, 0] }, ease: 'outCubic' },
      { t: 0.45, pose: { ...stand, ...lungeL, spine: [6, 26, 0], chest: [2, 12, 0], upperArmR: [-90, 0, 25], lowerArmR: [-6, 0, 0] }, ease: 'inQuad' },
      { t: 0.7, pose: { ...stand, ...lungeL, spine: [4, 30, 0], upperArmR: [-70, 0, 45], lowerArmR: [-25, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.45, fadeIn: 0.05 },
  ),
);

// ------------------------------------------------------------------ Beatrice: Yin magic
add(
  clip(
    'castPoint',
    0.9,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...stand, spine: [-6, -8, 0], head: [-8, 0, 0], upperArmR: [-150, 0, -10], lowerArmR: [-40, 0, 0], upperArmL: [8, -70, 34], lowerArmL: [-90, 0, 0] }, ease: 'outCubic' },
      { t: 0.5, pose: { ...stand, spine: [2, 6, 0], head: [-4, 0, 0], upperArmR: [-95, 0, -6], lowerArmR: [0, 0, 0], handR: [-10, 0, 0], upperArmL: [8, -70, 34], lowerArmL: [-90, 0, 0] }, ease: 'outExpo' },
      { t: 0.8, pose: { ...stand, spine: [2, 6, 0], upperArmR: [-90, 0, -6], lowerArmR: [-4, 0, 0], upperArmL: [8, -70, 34], lowerArmL: [-90, 0, 0] } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.5, fadeIn: 0.08, mask: UPPER_BODY },
  ),
);
add(
  clip(
    'ward',
    1.0,
    [
      { t: 0, pose: stand },
      { t: 0.3, pose: { ...symmetric({ upperArmL: [-88, 0, 28], lowerArmL: [-25, 0, 0], handL: [-50, 0, 0] }), spine: [4, 0, 0], ...brace }, ease: 'outBack' },
      { t: 0.8, pose: { ...symmetric({ upperArmL: [-86, 0, 28], lowerArmL: [-28, 0, 0], handL: [-50, 0, 0] }), spine: [4, 0, 0], ...brace } },
      { t: 1, pose: stand, ease: 'inOutCubic' },
    ],
    { contact: 0.3, fadeIn: 0.06 },
  ),
);

// ------------------------------------------------------------------ Julius: swordplay
const guardSword: PoseSpec = { ...stand, upperArmR: [-40, 0, -20], lowerArmR: [-80, 0, 0], handR: [0, 0, 0], upperArmL: [-10, 0, 14], lowerArmL: [-30, 0, 0] };
add(
  clip(
    'slash1',
    0.5,
    [
      { t: 0, pose: guardSword },
      { t: 0.3, pose: { ...guardSword, ...brace, spine: [0, -28, 0], chest: [0, -12, 0], upperArmR: [-70, 0, -80], lowerArmR: [-40, 0, 0] }, ease: 'outCubic' },
      { t: 0.46, pose: { ...guardSword, ...lungeL, spine: [6, 24, 0], chest: [2, 12, 0], upperArmR: [-88, 0, 30], lowerArmR: [-4, 0, 0] }, ease: 'inQuad' },
      { t: 1, pose: guardSword, ease: 'inOutCubic' },
    ],
    { contact: 0.46, fadeIn: 0.05, fadeOut: 0.12 },
  ),
);
add(
  clip(
    'slash2',
    0.5,
    [
      { t: 0, pose: guardSword },
      { t: 0.28, pose: { ...guardSword, ...brace, spine: [0, 26, 0], upperArmR: [-95, 20, 35], lowerArmR: [-70, 0, 0] }, ease: 'outCubic' },
      { t: 0.46, pose: { ...guardSword, ...lungeL, spine: [4, -22, 0], upperArmR: [-70, 0, -70], lowerArmR: [-5, 0, 0] }, ease: 'inQuad' },
      { t: 1, pose: guardSword, ease: 'inOutCubic' },
    ],
    { contact: 0.46, fadeIn: 0.05, fadeOut: 0.12 },
  ),
);
add(
  clip(
    'thrust',
    0.6,
    [
      { t: 0, pose: guardSword },
      { t: 0.35, pose: { ...guardSword, ...brace, spine: [-4, -12, 0], upperArmR: [-20, 0, -10], lowerArmR: [-110, 0, 0] }, ease: 'outCubic' },
      { t: 0.5, pose: { ...guardSword, upperLegL: [-40, 0, 0], lowerLegL: [35, 0, 0], upperLegR: [20, 0, 0], lowerLegR: [8, 0, 0], hipsOffset: [0, -0.1, 0.18], spine: [10, 10, 0], upperArmR: [-92, 0, 0], lowerArmR: [0, 0, 0] }, ease: 'outExpo' },
      { t: 1, pose: guardSword, ease: 'inOutCubic' },
    ],
    { contact: 0.5, fadeIn: 0.05 },
  ),
);
add(
  clip(
    'clauzeria',
    1.7,
    [
      { t: 0, pose: guardSword },
      { t: 0.3, pose: { ...guardSword, ...brace, spine: [-10, 0, 0], head: [-10, 0, 0], upperArmR: [-176, 0, -5], lowerArmR: [-15, 0, 0], upperArmL: [-176, 0, 5], lowerArmL: [-20, 0, 0] }, ease: 'outCubic' },
      { t: 0.55, pose: { ...guardSword, ...brace, spine: [-12, 0, 0], head: [-12, 0, 0], upperArmR: [-179, 0, -5], lowerArmR: [-12, 0, 0], upperArmL: [-177, 0, 5], lowerArmL: [-18, 0, 0] } },
      { t: 0.66, pose: { ...guardSword, upperLegL: [-45, 0, 0], lowerLegL: [50, 0, 0], upperLegR: [22, 0, 0], lowerLegR: [15, 0, 0], hipsOffset: [0, -0.2, 0.25], hips: [16, 0, 0], spine: [24, 0, 0], upperArmR: [-50, 0, -5], lowerArmR: [0, 0, 0], upperArmL: [-52, 0, 5], lowerArmL: [-5, 0, 0] }, ease: 'inExpo' },
      { t: 0.85, pose: { ...guardSword, upperLegL: [-45, 0, 0], lowerLegL: [50, 0, 0], upperLegR: [22, 0, 0], lowerLegR: [15, 0, 0], hipsOffset: [0, -0.2, 0.25], hips: [16, 0, 0], spine: [22, 0, 0], upperArmR: [-40, 0, -5], lowerArmR: [0, 0, 0], upperArmL: [-42, 0, 5] } },
      { t: 1, pose: guardSword, ease: 'inOutCubic' },
    ],
    { contact: 0.66, fadeIn: 0.1 },
  ),
);

// ------------------------------------------------------------------ Reid: a pair of chopsticks
// Ready: loose, weight back, the right hand up by the chest with the sticks.
const reidReady: PoseSpec = { ...stand, upperArmR: [-28, 14, -12], lowerArmR: [-96, 0, 0], handR: [0, 0, 8], upperArmL: [4, -50, 26], lowerArmL: [-84, 0, 0], spine: [2, 6, 0], upperLegR: [-6, 0, -4], lowerLegR: [10, 0, 0], hipsOffset: [0.015, -0.01, 0] };
add(
  clip(
    'reidFlick',
    0.5,
    [
      { t: 0, pose: reidReady },
      { t: 0.4, pose: { ...reidReady, ...brace, spine: [-2, -18, 0], upperArmR: [-50, 30, -40], lowerArmR: [-120, 0, 0], handR: [0, 0, -30] }, ease: 'outCubic' },
      { t: 0.55, pose: { ...reidReady, ...lungeL, spine: [6, 16, 0], upperArmR: [-84, -6, 12], lowerArmR: [-10, 0, 0], handR: [0, 0, 20] }, ease: 'inExpo' },
      { t: 1, pose: reidReady, ease: 'inOutCubic' },
    ],
    { contact: 0.55, fadeIn: 0.04, fadeOut: 0.12 },
  ),
);
add(
  clip(
    'reidParry',
    0.28,
    [
      { t: 0, pose: reidReady },
      { t: 0.35, pose: { ...reidReady, upperArmR: [-62, 4, -20], lowerArmR: [-70, 0, 0], handR: [0, 0, -34], spine: [0, -8, 0] }, ease: 'outExpo' },
      { t: 1, pose: reidReady, ease: 'inOutCubic' },
    ],
    { fadeIn: 0.02, fadeOut: 0.08 },
  ),
);
add(
  clip(
    'reidGuard',
    0.6,
    [
      { t: 0, pose: stand },
      { t: 1, pose: reidReady, ease: 'outCubic' },
    ],
    { fadeIn: 0.1, fadeOut: 0.3 },
  ),
);
// Seated on a fallen drum of stone, a bowl in one hand, eating (play with holdEnd).
const reidSeat: PoseSpec = {
  ...symmetric({ upperLegL: [-84, 0, 10], lowerLegL: [80, 0, 0], footL: [4, 0, 0] }),
  upperArmL: [-26, -30, 10],
  lowerArmL: [-96, 0, 0],
  handL: [0, 0, 20],
  upperArmR: [-36, 20, -14],
  lowerArmR: [-128, 0, 0],
  handR: [0, 0, 6],
  hipsOffset: [0, -0.44, -0.04],
  spine: [10, 0, 0],
  neck: [6, 0, 0],
  head: [8, 0, 0],
};
add(
  clip(
    'reidEat',
    1.6,
    [
      { t: 0, pose: stand },
      { t: 0.5, pose: { ...reidSeat, hipsOffset: [0, -0.3, -0.03] }, ease: 'inOutSine' },
      { t: 0.75, pose: { ...reidSeat, lowerArmR: [-142, 0, 0], head: [2, 0, 0] }, ease: 'inOutSine' },
      { t: 1, pose: reidSeat, ease: 'inOutSine' },
    ],
    { fadeIn: 0.1, fadeOut: 0.5 },
  ),
);
// One chopstick gone: he shakes out his hand and laughs.
add(
  clip(
    'reidDropped',
    1.2,
    [
      { t: 0, pose: reidReady },
      { t: 0.2, pose: { ...reidReady, upperArmR: [-10, 0, -30], lowerArmR: [-40, 0, 0], handR: [0, 0, 30] }, ease: 'outCubic' },
      { t: 0.45, pose: { ...reidReady, upperArmR: [-14, 0, -24], lowerArmR: [-60, 0, 0], handR: [0, 0, -30], spine: [-8, 0, 0], head: [-14, 0, 0] }, ease: 'inOutSine' },
      { t: 0.7, pose: { ...reidReady, upperArmR: [-10, 0, -30], lowerArmR: [-40, 0, 0], handR: [0, 0, 30], spine: [-10, 0, 0], head: [-16, 0, 0] }, ease: 'inOutSine' },
      { t: 1, pose: reidReady, ease: 'inOutCubic' },
    ],
    { fadeIn: 0.05, fadeOut: 0.3 },
  ),
);

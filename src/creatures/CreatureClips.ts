import { Easing, type EasingName } from '../core/math/MathUtil';

/**
 * Additive creature action clips. Rotations are in the creature's root
 * space (x = pitch nose-down positive, y = yaw left positive, z = roll),
 * degrees, applied on top of the procedural pose. `jaw` is 0..1 open.
 */
export interface CreatureKey {
  t: number;
  bones: Record<string, [number, number, number]>;
  jaw?: number;
  /** Hips offset in root space (m). */
  lift?: number;
  ease?: EasingName;
}

export interface CreatureClip {
  id: string;
  duration: number;
  keys: CreatureKey[];
  /** Normalised time of the "contact" beat (onContact). */
  contact?: number;
  /** Lower-body free: the gait keeps running underneath. */
  upperOnly?: boolean;
}

const clips: Record<string, CreatureClip> = {};
function reg(c: CreatureClip): void {
  clips[c.id] = c;
}

// Neck/head names follow the land-dragon rig; clips referencing bones a
// creature lacks simply skip them.
reg({
  id: 'nuzzle',
  duration: 1.8,
  contact: 0.45,
  upperOnly: true,
  keys: [
    { t: 0, bones: {} },
    { t: 0.3, bones: { neck0: [22, 0, 0], neck1: [18, 6, 0], neck2: [10, 8, 0], head: [8, 10, 14] }, ease: 'outCubic' },
    { t: 0.5, bones: { neck0: [24, 0, 0], neck1: [20, -4, 0], neck2: [12, -6, 0], head: [10, -8, -12] } },
    { t: 0.7, bones: { neck0: [22, 0, 0], neck1: [18, 6, 0], neck2: [10, 8, 0], head: [8, 10, 12] } },
    { t: 1, bones: {}, ease: 'inOutCubic' },
  ],
});
reg({
  id: 'roar',
  duration: 1.6,
  contact: 0.35,
  keys: [
    { t: 0, bones: {} },
    { t: 0.22, bones: { chest: [6, 0, 0], neck0: [10, 0, 0], neck1: [8, 0, 0], head: [12, 0, 0] }, jaw: 0.1, ease: 'outCubic' },
    { t: 0.4, bones: { chest: [-8, 0, 0], neck0: [-22, 0, 0], neck1: [-18, 0, 0], neck2: [-10, 0, 0], head: [-18, 0, 0] }, jaw: 1, lift: 0.04, ease: 'outBack' },
    { t: 0.75, bones: { chest: [-6, 0, 0], neck0: [-18, 0, 0], neck1: [-14, 0, 0], neck2: [-8, 0, 0], head: [-14, 0, 0] }, jaw: 0.85 },
    { t: 1, bones: {}, jaw: 0, ease: 'inOutCubic' },
  ],
});
reg({
  id: 'snort',
  duration: 0.9,
  upperOnly: true,
  keys: [
    { t: 0, bones: {} },
    { t: 0.25, bones: { neck2: [-6, 0, 0], head: [-10, 0, 0] }, jaw: 0.2, ease: 'outCubic' },
    { t: 0.45, bones: { neck2: [6, 0, 0], head: [12, 0, 0] }, jaw: 0 },
    { t: 0.6, bones: { head: [0, 8, 6] } },
    { t: 0.75, bones: { head: [0, -8, -6] } },
    { t: 1, bones: {}, ease: 'inOutSine' },
  ],
});
reg({
  id: 'alert',
  duration: 1.4,
  upperOnly: true,
  keys: [
    { t: 0, bones: {} },
    { t: 0.25, bones: { chest: [-4, 0, 0], neck0: [-14, 0, 0], neck1: [-10, 0, 0], head: [6, 0, 0], tail0: [-10, 0, 0] }, ease: 'outCubic' },
    { t: 0.8, bones: { chest: [-4, 0, 0], neck0: [-14, 0, 0], neck1: [-10, 0, 0], head: [6, 0, 0], tail0: [-10, 0, 0] } },
    { t: 1, bones: {}, ease: 'inOutCubic' },
  ],
});
reg({
  id: 'shake',
  duration: 1.1,
  keys: [
    { t: 0, bones: {} },
    { t: 0.15, bones: { chest: [0, 0, 10], neck0: [0, 12, 0], head: [0, 16, 10], tail1: [0, -14, 0] } },
    { t: 0.3, bones: { chest: [0, 0, -10], neck0: [0, -12, 0], head: [0, -16, -10], tail1: [0, 14, 0] } },
    { t: 0.45, bones: { chest: [0, 0, 8], neck0: [0, 10, 0], head: [0, 12, 8], tail1: [0, -12, 0] } },
    { t: 0.6, bones: { chest: [0, 0, -6], neck0: [0, -8, 0], head: [0, -10, -6], tail1: [0, 10, 0] } },
    { t: 1, bones: {}, ease: 'outCubic' },
  ],
});
reg({
  id: 'lowerHead',
  duration: 1.6,
  upperOnly: true,
  keys: [
    { t: 0, bones: {} },
    { t: 0.35, bones: { neck0: [30, 0, 0], neck1: [22, 0, 0], neck2: [12, 0, 0], head: [10, 0, 0] }, ease: 'outCubic' },
    { t: 0.7, bones: { neck0: [30, 0, 0], neck1: [22, 0, 0], neck2: [12, 0, 0], head: [10, 0, 0] } },
    { t: 1, bones: {}, ease: 'inOutCubic' },
  ],
});

// ------------------------------------------------------------------ witchbeast combat
reg({
  id: 'bite',
  duration: 0.75,
  contact: 0.5,
  keys: [
    { t: 0, bones: {} },
    { t: 0.4, bones: { chest: [-6, 0, 0], neck0: [-14, 0, 0], neck1: [-10, 0, 0], head: [-12, 0, 0] }, jaw: 0.7, lift: 0.02, ease: 'outCubic' },
    { t: 0.52, bones: { chest: [8, 0, 0], neck0: [22, 0, 0], neck1: [12, 0, 0], head: [10, 0, 0] }, jaw: 0.05, ease: 'inExpo' },
    { t: 0.7, bones: { chest: [4, 0, 0], neck0: [12, 0, 0], head: [6, 0, 0] }, jaw: 0.2 },
    { t: 1, bones: {}, jaw: 0, ease: 'inOutCubic' },
  ],
});
reg({
  id: 'pounce',
  duration: 1.0,
  contact: 0.55,
  keys: [
    { t: 0, bones: {} },
    { t: 0.4, bones: { hips: [10, 0, 0], chest: [-4, 0, 0], neck0: [-10, 0, 0], head: [-8, 0, 0], tail0: [-15, 0, 0] }, lift: -0.12, jaw: 0.4, ease: 'outCubic' },
    { t: 0.55, bones: { hips: [-14, 0, 0], chest: [-10, 0, 0], neck0: [16, 0, 0], head: [8, 0, 0], tail0: [10, 0, 0] }, lift: 0.28, jaw: 0.9, ease: 'outExpo' },
    { t: 0.75, bones: { hips: [6, 0, 0], chest: [6, 0, 0], neck0: [10, 0, 0] }, lift: 0.02, jaw: 0.1, ease: 'inQuad' },
    { t: 1, bones: {}, jaw: 0, ease: 'inOutCubic' },
  ],
});
reg({
  id: 'howl',
  duration: 1.8,
  contact: 0.3,
  keys: [
    { t: 0, bones: {} },
    { t: 0.25, bones: { chest: [-8, 0, 0], neck0: [-35, 0, 0], neck1: [-25, 0, 0], head: [-25, 0, 0], tail0: [-10, 0, 0] }, jaw: 0.9, ease: 'outCubic' },
    { t: 0.8, bones: { chest: [-8, 0, 0], neck0: [-38, 0, 0], neck1: [-28, 0, 0], head: [-28, 0, 0], tail0: [-12, 0, 0] }, jaw: 1 },
    { t: 1, bones: {}, jaw: 0, ease: 'inOutCubic' },
  ],
});
reg({
  id: 'snarl',
  duration: 0.9,
  upperOnly: true,
  keys: [
    { t: 0, bones: {} },
    { t: 0.3, bones: { neck0: [14, 0, 0], neck1: [8, 0, 0], head: [-6, 0, 0], tail0: [-8, 0, 0] }, jaw: 0.45, ease: 'outCubic' },
    { t: 0.8, bones: { neck0: [14, 0, 0], neck1: [8, 0, 0], head: [-6, 0, 0] }, jaw: 0.35 },
    { t: 1, bones: {}, jaw: 0, ease: 'inOutCubic' },
  ],
});
reg({
  id: 'flinch',
  duration: 0.4,
  keys: [
    { t: 0, bones: {} },
    { t: 0.25, bones: { chest: [0, 0, 8], neck0: [-8, 10, 0], head: [-6, 12, 0], tail1: [0, -12, 0] }, jaw: 0.3, ease: 'outExpo' },
    { t: 1, bones: {}, jaw: 0, ease: 'outCubic' },
  ],
});
reg({
  id: 'death',
  duration: 1.4,
  keys: [
    { t: 0, bones: {} },
    { t: 0.35, bones: { chest: [0, 0, 18], neck0: [-10, 14, 0], head: [-12, 16, 0], tail0: [10, 0, 0] }, jaw: 0.6, lift: -0.12, ease: 'outCubic' },
    { t: 1, bones: { hips: [0, 0, 70], chest: [0, 0, 20], neck0: [20, 18, 0], neck1: [10, 0, 0], head: [10, 10, 0], tail0: [0, 20, 0] }, jaw: 0.3, lift: -0.42, ease: 'inQuad' },
  ],
});

/** Interaction verbs the humanoids use, mapped to creature equivalents. */
const ALIASES: Record<string, string> = { reachMid: 'snort', reachLow: 'lowerHead', use: 'snort', examine: 'lowerHead', surprised: 'alert', hitReact: 'flinch', stagger: 'shake', collapse: 'death' };

export function creatureClip(name: string): CreatureClip {
  return clips[ALIASES[name] ?? name] ?? clips.snort!;
}

export interface SampledCreatureKey {
  bones: Record<string, [number, number, number]>;
  jaw: number;
  lift: number;
}

/** Sample a clip at normalised time u (0..1), blending neighbouring keys. */
export function sampleCreatureClip(c: CreatureClip, u: number, out: SampledCreatureKey): SampledCreatureKey {
  const keys = c.keys;
  let i = 1;
  while (i < keys.length - 1 && u > keys[i]!.t) i++;
  const a = keys[i - 1]!;
  const b = keys[i]!;
  const local = Math.min(1, Math.max(0, (u - a.t) / Math.max(1e-5, b.t - a.t)));
  const e = Easing[b.ease ?? 'inOutSine'](local);
  for (const k of Object.keys(out.bones)) delete out.bones[k];
  const names = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)]);
  for (const n of names) {
    const va = a.bones[n] ?? [0, 0, 0];
    const vb = b.bones[n] ?? [0, 0, 0];
    out.bones[n] = [va[0] + (vb[0] - va[0]) * e, va[1] + (vb[1] - va[1]) * e, va[2] + (vb[2] - va[2]) * e];
  }
  out.jaw = (a.jaw ?? 0) + ((b.jaw ?? 0) - (a.jaw ?? 0)) * e;
  out.lift = (a.lift ?? 0) + ((b.lift ?? 0) - (a.lift ?? 0)) * e;
  return out;
}

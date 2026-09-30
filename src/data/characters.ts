import type { GaitStyle } from '../characters/anim/Gait';
import type { FaceStyle } from '../characters/face/FaceRenderer';
import type { ActorMovement } from '../actors/ActorController';

/**
 * Character definitions — the data side of every cast member (the Unity
 * ScriptableObject equivalent). Systems read these; adding a character
 * means adding a definition and a Blender spec, not new code.
 */
export interface SpringChainDef {
  /** Bone name prefix (e.g. "hair_back" matches hair_back_0.._n). */
  prefix: string;
  stiffness: number;
  drag: number;
  gravity: number;
  hitRadius?: number;
}

export interface VoiceDef {
  /** Base pitch of the procedural voice blips (Hz). */
  pitch: number;
  /** Syllables per second. */
  rate: number;
  timbre: 'soft' | 'bright' | 'breathy' | 'crisp' | 'deep';
}

export interface CharacterDefinition {
  id: string;
  name: string;
  /** Short name for dialogue boxes. */
  shortName: string;
  model: string;
  height: number;
  stance: string;
  gait: Partial<GaitStyle>;
  face: FaceStyle;
  defaultExpression: string;
  springs: SpringChainDef[];
  voice: VoiceDef;
  nameColor: string;
  outline: string;
  /** NPC movement overrides (the player uses its own profile). */
  movement?: Partial<ActorMovement>;
}

/** Spring presets (VRM-style units: stiffness/gravity are per-second pulls). */
const HAIR_LONG: Omit<SpringChainDef, 'prefix'> = { stiffness: 1.4, drag: 0.42, gravity: 0.18, hitRadius: 0.02 };
const HAIR_SIDE: Omit<SpringChainDef, 'prefix'> = { stiffness: 1.8, drag: 0.45, gravity: 0.12, hitRadius: 0.015 };
const DRILL: Omit<SpringChainDef, 'prefix'> = { stiffness: 1.1, drag: 0.22, gravity: 0.3, hitRadius: 0.03 };
const SKIRT: Omit<SpringChainDef, 'prefix'> = { stiffness: 2.6, drag: 0.5, gravity: 0.08, hitRadius: 0.035 };
const COAT: Omit<SpringChainDef, 'prefix'> = { stiffness: 2.0, drag: 0.48, gravity: 0.15, hitRadius: 0.035 };
const CAPE: Omit<SpringChainDef, 'prefix'> = { stiffness: 1.2, drag: 0.4, gravity: 0.3, hitRadius: 0.04 };

function chains(preset: Omit<SpringChainDef, 'prefix'>, ...prefixes: string[]): SpringChainDef[] {
  return prefixes.map((prefix) => ({ prefix, ...preset }));
}

export const CHARACTERS: Record<string, CharacterDefinition> = {
  subaru: {
    id: 'subaru',
    name: 'Natsuki Subaru',
    shortName: 'Subaru',
    model: 'assets/models/characters/subaru.glb',
    height: 1.73,
    stance: 'subaru',
    gait: { slouch: 0.6, armSwing: 1.1, posture: 3, stride: 1, bounce: 1.1 },
    face: {
      skin: '#f3d9c7',
      iris: '#2a2530',
      irisLight: '#6b5d74',
      brow: '#1d1f29',
      lash: '#15151c',
      eyeSize: 0.86,
      tilt: 0.25,
      sanpaku: true,
      lashWeight: 1.1,
    },
    defaultExpression: 'neutral',
    springs: [],
    voice: { pitch: 150, rate: 11, timbre: 'bright' },
    nameColor: '#f0a060',
    outline: '#2a2626',
  },
  emilia: {
    id: 'emilia',
    name: 'Emilia',
    shortName: 'Emilia',
    model: 'assets/models/characters/emilia.glb',
    height: 1.64,
    stance: 'emilia',
    gait: { hipSway: 0.35, armSwing: 0.8, stride: 0.95, posture: 0, bounce: 0.9 },
    face: {
      skin: '#f6e1d6',
      iris: '#7c5cc4',
      irisLight: '#c9b4f4',
      brow: '#b8b2c8',
      lash: '#4e4460',
      eyeSize: 1.12,
      tilt: -0.06,
      lashWeight: 1.25,
      blushColor: '#f29db2',
    },
    defaultExpression: 'neutral',
    springs: [...chains(HAIR_LONG, 'hair_back'), ...chains(HAIR_SIDE, 'hair_side'), ...chains(SKIRT, 'skirt')],
    voice: { pitch: 260, rate: 10, timbre: 'soft' },
    nameColor: '#c9b4f4',
    outline: '#3a3346',
  },
  beatrice: {
    id: 'beatrice',
    name: 'Beatrice',
    shortName: 'Beatrice',
    model: 'assets/models/characters/beatrice.glb',
    height: 1.28,
    stance: 'beatrice',
    gait: { armsIn: 0.8, cadence: 1.25, stride: 0.9, armSwing: 0.6, posture: -2, bounce: 1.3 },
    face: {
      skin: '#fbe7dc',
      iris: '#5c8fe0',
      irisLight: '#bfe0ff',
      pupil: '#e88cc0',
      pupilShape: 'butterfly',
      brow: '#dcc58c',
      lash: '#6a5a3a',
      eyeSize: 1.28,
      tilt: 0.12,
      lashWeight: 1.35,
      blushColor: '#f5a0b8',
    },
    defaultExpression: 'neutral',
    springs: [...chains(DRILL, 'hair_drill'), ...chains(SKIRT, 'skirt')],
    voice: { pitch: 330, rate: 12, timbre: 'crisp' },
    nameColor: '#f0a3c4',
    outline: '#3a2e2a',
    movement: { walkSpeed: 1.3, runSpeed: 3.6 },
  },
  julius: {
    id: 'julius',
    name: 'Julius Juukulius',
    shortName: 'Julius',
    model: 'assets/models/characters/julius.glb',
    height: 1.8,
    stance: 'julius',
    gait: { posture: -2, armSwing: 0.7, stride: 1.08, slouch: -0.3, bounce: 0.8 },
    face: {
      skin: '#f4dcca',
      iris: '#c29a2e',
      irisLight: '#f2dc8c',
      brow: '#7d6aa8',
      lash: '#2e2640',
      eyeSize: 0.92,
      tilt: 0.12,
      lashWeight: 1.05,
    },
    defaultExpression: 'neutral',
    springs: [...chains(CAPE, 'cape'), ...chains(COAT, 'coat')],
    voice: { pitch: 125, rate: 9, timbre: 'deep' },
    nameColor: '#b6a0dc',
    outline: '#262634',
  },
  ram: {
    id: 'ram',
    name: 'Ram',
    shortName: 'Ram',
    model: 'assets/models/characters/ram.glb',
    height: 1.54,
    stance: 'ram',
    gait: { posture: -1, armsIn: 0.5, armSwing: 0.6, hipSway: 0.2, bounce: 0.8 },
    face: {
      skin: '#f8e4d8',
      iris: '#e0708f',
      irisLight: '#ffc4d4',
      brow: '#d58aa0',
      lash: '#56303e',
      eyeSize: 1.02,
      tilt: 0.16,
      lashWeight: 1.2,
    },
    defaultExpression: 'neutral',
    springs: [...chains(SKIRT, 'skirt'), ...chains(COAT, 'apron')],
    voice: { pitch: 240, rate: 10, timbre: 'crisp' },
    nameColor: '#f2a7bb',
    outline: '#2c2630',
  },
  rem: {
    id: 'rem',
    name: 'Rem',
    shortName: 'Rem',
    model: 'assets/models/characters/rem.glb',
    height: 1.54,
    stance: 'rest',
    gait: { posture: 0, armsIn: 0.4, hipSway: 0.2 },
    face: {
      skin: '#f8e4d8',
      iris: '#4a78d0',
      irisLight: '#a9c8ff',
      brow: '#6f8cc8',
      lash: '#2a3250',
      eyeSize: 1.04,
      tilt: -0.04,
      lashWeight: 1.2,
      sleeping: true,
    },
    defaultExpression: 'sleeping',
    springs: [...chains(SKIRT, 'skirt'), ...chains(COAT, 'apron')],
    voice: { pitch: 245, rate: 10, timbre: 'soft' },
    nameColor: '#7da3e0',
    outline: '#262c38',
  },
  meili: {
    id: 'meili',
    name: 'Meili Portroute',
    shortName: 'Meili',
    model: 'assets/models/characters/meili.glb',
    height: 1.45,
    stance: 'meili',
    gait: { bounce: 1.3, hipSway: 0.25, armSwing: 0.9, cadence: 1.1 },
    face: {
      skin: '#f7e3d6',
      iris: '#9bba2e',
      irisLight: '#e4f28a',
      brow: '#2b3a78',
      lash: '#1a2036',
      eyeSize: 1.16,
      tilt: 0.04,
      lashWeight: 1.25,
    },
    defaultExpression: 'happy',
    springs: chains(SKIRT, 'skirt'),
    voice: { pitch: 285, rate: 11, timbre: 'bright' },
    nameColor: '#8fb8e8',
    outline: '#22283c',
  },
  anastasia: {
    id: 'anastasia',
    name: 'Anastasia Hoshin',
    shortName: 'Anastasia',
    model: 'assets/models/characters/anastasia.glb',
    height: 1.55,
    stance: 'anastasia',
    gait: { hipSway: 0.3, armSwing: 0.5, stride: 0.92, posture: 0 },
    face: {
      skin: '#f8e6da',
      iris: '#3f9c7e',
      irisLight: '#a4e6c8',
      brow: '#9c90b8',
      lash: '#40364e',
      eyeSize: 1.04,
      tilt: -0.1,
      lashWeight: 1.2,
    },
    defaultExpression: 'happy',
    springs: [...chains(HAIR_LONG, 'hair_back'), ...chains(HAIR_SIDE, 'hair_side'), ...chains(SKIRT, 'skirt')],
    voice: { pitch: 250, rate: 9, timbre: 'soft' },
    nameColor: '#c9b6e6',
    outline: '#322c3c',
  },
  shaula: {
    id: 'shaula',
    name: 'Shaula',
    shortName: 'Shaula',
    model: 'assets/models/characters/shaula.glb',
    height: 1.72,
    stance: 'shaula',
    gait: { bounce: 1.5, armSwing: 1.4, stride: 1.1, hipSway: 0.4, posture: -1 },
    face: {
      skin: '#f1d4bf',
      iris: '#3aa865',
      irisLight: '#a6f0b6',
      brow: '#3a2a24',
      lash: '#1e1512',
      eyeSize: 1.08,
      tilt: 0.08,
      lashWeight: 1.2,
    },
    defaultExpression: 'happy',
    springs: [{ prefix: 'hair_tail', stiffness: 1.0, drag: 0.3, gravity: 0.25, hitRadius: 0.035 }, ...chains(CAPE, 'cape')],
    voice: { pitch: 270, rate: 13, timbre: 'bright' },
    nameColor: '#e0a050',
    outline: '#2a201c',
  },
  reid: {
    id: 'reid',
    name: 'Reid Astrea',
    shortName: 'Reid',
    model: 'assets/models/characters/reid.glb',
    height: 1.86,
    stance: 'reid',
    gait: { posture: 2, armSwing: 1.2, stride: 1.15, slouch: 0.6, bounce: 1.1 },
    face: {
      skin: '#e7c1a0',
      iris: '#3f7fd6',
      irisLight: '#a8d0ff',
      brow: '#8e1c1e',
      lash: '#3a1414',
      eyeSize: 0.86,
      tilt: 0.18,
      lashWeight: 1.0,
    },
    defaultExpression: 'smug',
    springs: [{ prefix: 'hair_back', stiffness: 2.2, drag: 0.45, gravity: 0.1, hitRadius: 0.02 }, ...chains(CAPE, 'cape')],
    voice: { pitch: 112, rate: 11, timbre: 'deep' },
    nameColor: '#e0503c',
    outline: '#2a1a18',
  },
};

export function characterDef(id: string): CharacterDefinition {
  const d = CHARACTERS[id];
  if (!d) throw new Error(`Unknown character "${id}"`);
  return d;
}

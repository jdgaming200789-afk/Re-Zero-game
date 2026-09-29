import type { GaitStyle } from '../characters/anim/Gait';
import type { FaceStyle } from '../characters/face/FaceRenderer';
import type { MovementProfile } from '../player/PlayerController';

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
  movement?: Partial<MovementProfile>;
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
};

export function characterDef(id: string): CharacterDefinition {
  const d = CHARACTERS[id];
  if (!d) throw new Error(`Unknown character "${id}"`);
  return d;
}

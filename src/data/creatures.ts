import type { ActorMovement } from '../actors/ActorController';
import type { SpringChainDef, VoiceDef } from './characters';

/**
 * Creature definitions (land dragons, witchbeasts). The visual is procedural:
 * legs are driven by a phase-based gait with ground IK, the spine/neck/tail
 * by secondary motion, so a new creature is a Blender spec plus this data.
 */
export interface CreatureLegDef {
  /** Hip → knee → ankle bones (two-bone IK). */
  upper: string;
  lower: string;
  /** Digitigrade metatarsus (ankle → ball) and toe, if any. */
  meta?: string;
  toe?: string;
  /** Gait phase offset 0..1 (biped: 0 / 0.5). */
  phase: number;
}

export interface CreatureGait {
  /** Stride length as a multiple of leg length at a walk / run. */
  walkStride: number;
  runStride: number;
  /** Foot lift at a walk (m). */
  stepHeight: number;
  /** Stance fraction of the cycle at a walk / run. */
  walkDuty: number;
  runDuty: number;
  /** Speed at which the gait becomes a run (m/s). */
  runSpeed: number;
  /** Vertical body bob amplitude (m). */
  bob: number;
  /** Body forward pitch at full run (degrees). */
  runLean: number;
}

export interface CreatureDefinition {
  id: string;
  name: string;
  shortName: string;
  model: string;
  height: number;
  radius?: number;
  bodyPlan: 'biped' | 'quadruped';
  legs: CreatureLegDef[];
  hips: string;
  spine: string[];
  neck: string[];
  head: string;
  jaw?: string;
  tail: string[];
  gait: CreatureGait;
  springs: SpringChainDef[];
  voice: VoiceDef;
  nameColor: string;
  outline: string;
  movement?: Partial<ActorMovement>;
}

export const CREATURES: Record<string, CreatureDefinition> = {
  patrasche: {
    id: 'patrasche',
    name: 'Patrasche',
    shortName: 'Patrasche',
    model: 'assets/models/creatures/patrasche.glb',
    height: 2.1,
    radius: 0.42,
    bodyPlan: 'biped',
    legs: [
      { upper: 'thighL', lower: 'shinL', meta: 'metaL', toe: 'toeL', phase: 0 },
      { upper: 'thighR', lower: 'shinR', meta: 'metaR', toe: 'toeR', phase: 0.5 },
    ],
    hips: 'hips',
    spine: ['spine', 'chest'],
    neck: ['neck0', 'neck1', 'neck2'],
    head: 'head',
    jaw: 'jaw',
    tail: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
    gait: { walkStride: 1.1, runStride: 2.3, stepHeight: 0.16, walkDuty: 0.6, runDuty: 0.38, runSpeed: 3.2, bob: 0.05, runLean: 12 },
    springs: [{ prefix: 'tail', stiffness: 2.2, drag: 0.35, gravity: 0.05, hitRadius: 0.05 }],
    voice: { pitch: 90, rate: 4, timbre: 'deep' },
    nameColor: '#9aa3c8',
    outline: '#15161c',
    movement: { walkSpeed: 1.5, runSpeed: 4.2, sprintSpeed: 7.5, acceleration: 7, deceleration: 9, turnRate: 220 },
  },
};

export function creatureDef(id: string): CreatureDefinition {
  const d = CREATURES[id];
  if (!d) throw new Error(`Unknown creature "${id}"`);
  return d;
}

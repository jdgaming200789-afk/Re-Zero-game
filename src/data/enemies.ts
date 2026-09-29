import type { DamageType, Resistances } from '../combat/Damage';

export type AttackShape = { kind: 'arc'; reach: number; arc: number } | { kind: 'lunge'; distance: number; width: number } | { kind: 'circle'; radius: number };

export interface EnemyAttackDef {
  id: string;
  /** Creature clip played for the attack. */
  clip: string;
  /** Usable when the target's surface is within this band (m). */
  range: [number, number];
  /** Telegraph time before the hit lands (s). */
  windup: number;
  recovery: number;
  cooldown: number;
  shape: AttackShape;
  damage: number;
  type: DamageType;
  stagger: number;
  weight: number;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  /** Creature visual (src/data/creatures.ts). */
  creature: string;
  maxHp: number;
  poise: number;
  resist?: Resistances;
  perception: {
    /** Sight distance (m) and field of view (degrees). */
    sight: number;
    fov: number;
    /** Multiplier on how loud things sound to it. */
    hearing: number;
    /** Awareness gained per second while the target is fully visible. */
    awareness: number;
  };
  behaviour: 'pack' | 'solitary';
  /** Distance band it circles at while waiting to attack. */
  circleRange: [number, number];
  attacks: EnemyAttackDef[];
  /** Flees below this HP fraction (0 = never). */
  fleeAt: number;
  /** 'witchbeast' makes it charmable by Meili. */
  tags: string[];
  elite?: boolean;
}

export const ENEMIES: Record<string, EnemyDefinition> = {
  dune_jackal: {
    id: 'dune_jackal',
    name: 'Dune Jackal',
    creature: 'dune_jackal',
    maxHp: 85,
    poise: 24,
    resist: { miasma: 0, ice: 1.2 },
    perception: { sight: 22, fov: 150, hearing: 1, awareness: 1.4 },
    behaviour: 'pack',
    circleRange: [3.2, 5.5],
    fleeAt: 0.18,
    tags: ['witchbeast'],
    attacks: [
      {
        id: 'bite',
        clip: 'bite',
        range: [0, 1.4],
        windup: 0.45,
        recovery: 0.55,
        cooldown: 1.6,
        shape: { kind: 'arc', reach: 1.7, arc: 70 },
        damage: 8,
        type: 'physical',
        stagger: 10,
        weight: 3,
      },
      {
        id: 'pounce',
        clip: 'pounce',
        range: [2.2, 5.5],
        windup: 0.6,
        recovery: 0.8,
        cooldown: 4,
        shape: { kind: 'lunge', distance: 4.2, width: 1.1 },
        damage: 12,
        type: 'physical',
        stagger: 22,
        weight: 2,
      },
    ],
  },
};

/** The Sand Earthworm (elite): driven by EarthwormController, not the pack AI. */
ENEMIES.sand_earthworm = {
  id: 'sand_earthworm',
  name: 'Sand Earthworm',
  creature: 'sand_earthworm',
  maxHp: 1400,
  poise: 999,
  // Too tough to out-damage: the answer is the Heliosphere.
  resist: { physical: 0.35, ice: 0.6, yin: 0.5, wind: 0.6, fire: 0.8, light: 1 },
  perception: { sight: 0, fov: 0, hearing: 2.2, awareness: 1 },
  behaviour: 'solitary',
  circleRange: [0, 0],
  fleeAt: 0,
  tags: ['witchbeast'],
  elite: true,
  attacks: [],
};

export const EARTHWORM_MODEL = 'assets/models/creatures/sand_earthworm.glb';

export function enemyDef(id: string): EnemyDefinition {
  const d = ENEMIES[id];
  if (!d) throw new Error(`Unknown enemy "${id}"`);
  return d;
}

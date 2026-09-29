import type { Vector3 } from 'three';

export type Faction = 'party' | 'enemy' | 'neutral';

export type DamageType = 'physical' | 'ice' | 'fire' | 'wind' | 'yin' | 'yang' | 'light' | 'miasma';

/** Status effects applied by attacks and spells. */
export type StatusId =
  | 'frozen' // Emilia's ice: rooted, takes bonus physical damage
  | 'stopped' // Beatrice's Minya: time-locked, no actions
  | 'blinded' // Shamak: loses its target, attacks wildly
  | 'charmed' // Meili: fights for the party
  | 'marked' // Echidna's analysis: weak point exposed (+damage)
  | 'burning'
  | 'slowed';

export interface StatusApplication {
  id: StatusId;
  seconds: number;
  /** Effect strength (slow factor, damage bonus...). */
  magnitude?: number;
}

export interface DamageInfo {
  amount: number;
  type: DamageType;
  /** Entity id of the attacker (null for the environment). */
  sourceId: number | null;
  /** World position of the hit (effects, knockback direction). */
  point?: Vector3;
  /** Direction the blow travels (for knockback and hit reactions). */
  direction?: Vector3;
  /** Poise damage; exhausting poise staggers. */
  stagger?: number;
  knockback?: number;
  /** Seconds of global hit-stop (heavy blows). */
  hitStop?: number;
  critical?: boolean;
  status?: StatusApplication;
  /** e.g. 'melee', 'projectile', 'area', 'heliosphere'. */
  tags?: string[];
}

export interface DamageResult {
  applied: number;
  absorbed: number;
  killed: boolean;
  staggered: boolean;
  /** Ignored entirely (invulnerable, dead, same faction). */
  ignored: boolean;
}

export type Resistances = Partial<Record<DamageType, number>>;

/**
 * Pure damage calculation (unit-tested): resistance multiplier, status
 * interactions (frozen targets shatter under physical blows, marked ones
 * take more), critical bonus, shield absorption. Never negative.
 */
export function computeDamage(
  info: DamageInfo,
  resist: Resistances,
  statuses: ReadonlySet<StatusId>,
  shield: number,
): { damage: number; absorbed: number } {
  let dmg = info.amount * (resist[info.type] ?? 1);
  if (statuses.has('frozen') && info.type === 'physical') dmg *= 1.5;
  if (statuses.has('marked')) dmg *= 1.25;
  if (info.critical) dmg *= 1.5;
  dmg = Math.max(0, dmg);
  const absorbed = Math.min(shield, dmg);
  return { damage: Math.round((dmg - absorbed) * 10) / 10, absorbed };
}

export function hostile(a: Faction, b: Faction): boolean {
  return a !== b && a !== 'neutral' && b !== 'neutral';
}

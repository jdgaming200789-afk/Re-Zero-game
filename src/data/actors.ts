import type { ActorMovement } from '../actors/ActorController';
import { CHARACTERS } from './characters';
import { CREATURES } from './creatures';

/** What every actor (person or creature) shares, for movement and UI. */
export interface ActorDefinition {
  id: string;
  name: string;
  /** Short name for dialogue boxes and barks. */
  shortName: string;
  /** Standing height (m); sizes the collision capsule. */
  height: number;
  /** Capsule radius override (m) for broad creatures. */
  radius?: number;
  nameColor: string;
  movement?: Partial<ActorMovement>;
}

export function actorDef(id: string): ActorDefinition & { kind: 'humanoid' | 'creature' } {
  const c = CHARACTERS[id];
  if (c) return { ...c, kind: 'humanoid' };
  const k = CREATURES[id];
  if (k) return { ...k, kind: 'creature' };
  throw new Error(`Unknown actor "${id}"`);
}

export function isCreature(id: string): boolean {
  return id in CREATURES;
}

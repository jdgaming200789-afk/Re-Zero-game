import type { EventBus } from '../core/events/EventBus';
import type { FlagValue, GameEvents } from '../core/events/GameEvents';

/**
 * Story flags and world variables.
 *
 * Keys are namespaced, and the namespace decides what survives Return by
 * Death:
 *
 *   know.*   Subaru's knowledge. Survives death. (know.heliosphere.range)
 *   meta.*   Loop bookkeeping: deaths, loop count, records. Survives death.
 *   (other)  World state: doors, NPC states, quests-in-loop, pickups.
 *            Rewound to the checkpoint snapshot on Return by Death.
 *
 * Only primitive values are allowed so snapshots are trivially serialisable
 * and can never alias live objects (a classic source of save corruption).
 */
export type FlagScope = 'world' | 'knowledge' | 'meta';

export function scopeOf(key: string): FlagScope {
  if (key.startsWith('know.')) return 'knowledge';
  if (key.startsWith('meta.')) return 'meta';
  return 'world';
}

export type FlagSnapshot = Record<string, FlagValue>;

const KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i;

export class WorldStateManager {
  private readonly flags = new Map<string, FlagValue>();

  constructor(private readonly events: EventBus<GameEvents>) {}

  has(key: string): boolean {
    return this.flags.has(key);
  }

  get(key: string): FlagValue | undefined {
    return this.flags.get(key);
  }

  bool(key: string): boolean {
    const v = this.flags.get(key);
    return v === true || (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v.length > 0);
  }

  num(key: string, fallback = 0): number {
    const v = this.flags.get(key);
    return typeof v === 'number' ? v : fallback;
  }

  str(key: string, fallback = ''): string {
    const v = this.flags.get(key);
    return typeof v === 'string' ? v : fallback;
  }

  set(key: string, value: FlagValue): void {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid flag key "${key}"`);
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Flag "${key}" must be finite`);
    const previous = this.flags.get(key);
    if (previous === value) return;
    this.flags.set(key, value);
    this.events.emit('flag:changed', { key, value, previous });
  }

  add(key: string, delta = 1): number {
    const v = this.num(key) + delta;
    this.set(key, v);
    return v;
  }

  clear(key: string): void {
    const previous = this.flags.get(key);
    if (previous === undefined) return;
    this.flags.delete(key);
    this.events.emit('flag:changed', { key, value: false, previous });
  }

  /** Copy of all flags in the given scopes. */
  snapshot(scopes: FlagScope[] = ['world', 'knowledge', 'meta']): FlagSnapshot {
    const out: FlagSnapshot = {};
    for (const [k, v] of this.flags) if (scopes.includes(scopeOf(k))) out[k] = v;
    return out;
  }

  /**
   * Replace the flags of the given scopes with a snapshot. Flags of other
   * scopes are untouched — this is how Return by Death rewinds the world
   * while Subaru keeps what he learned.
   */
  restore(snapshot: FlagSnapshot, scopes: FlagScope[] = ['world', 'knowledge', 'meta']): void {
    for (const k of Array.from(this.flags.keys())) if (scopes.includes(scopeOf(k))) this.flags.delete(k);
    for (const [k, v] of Object.entries(snapshot)) {
      if (!KEY_PATTERN.test(k)) continue;
      if (typeof v !== 'boolean' && typeof v !== 'number' && typeof v !== 'string') continue;
      if (scopes.includes(scopeOf(k))) this.flags.set(k, v);
    }
    this.events.emit('flag:changed', { key: '*', value: true, previous: undefined });
  }

  entries(): Array<[string, FlagValue]> {
    return Array.from(this.flags.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }
}

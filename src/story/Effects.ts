import type { FlagValue } from '../core/events/GameEvents';
import { KNOWLEDGE } from '../data/knowledge';
import type { GameContext } from '../game/GameContext';

/**
 * Data-driven consequences, shared by dialogue lines and choices, cinematics
 * and quests. Everything an effect changes lives in world state (flags), so
 * Return by Death rewinds it — except `learn`, which is Subaru's knowledge
 * and survives.
 *
 *   { set: 'tf.warned', to: true }   { add: 'meta.trust.emilia', by: 1 }
 *   { clear: 'tf.alarm' }            { event: 'camp.opening.done' }
 *   { learn: 'heliosphere.movement' }  { item: 'tonic', count: 2 }
 *   { quest: 'watchtower' }          { quest: 'watchtower', do: 'complete' }
 *   { join: 'emilia' }               { leave: 'meili' }
 *   { notify: 'The wind is picking up.' }
 */
export type Effect =
  | { set: string; to?: FlagValue }
  | { add: string; by?: number }
  | { clear: string }
  | { event: string }
  | { learn: string }
  | { item: string; count?: number }
  | { quest: string; do?: 'start' | 'complete' | 'fail' }
  | { join: string }
  | { leave: string }
  | { notify: string };

const KEY = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i;

/** Throws on malformed effects (data validation in tests). */
export function validateEffect(e: Effect, known: { quests?: Set<string>; characters?: Set<string> } = {}): void {
  const key = (k: string, what: string) => {
    if (!KEY.test(k)) throw new Error(`Bad ${what} key "${k}"`);
  };
  if ('set' in e) key(e.set, 'flag');
  else if ('add' in e) key(e.add, 'flag');
  else if ('clear' in e) key(e.clear, 'flag');
  else if ('event' in e) key(e.event, 'event');
  else if ('learn' in e) {
    if (!KNOWLEDGE[e.learn]) throw new Error(`Unknown knowledge "${e.learn}"`);
  } else if ('item' in e) key(e.item, 'item');
  else if ('quest' in e) {
    if (known.quests && !known.quests.has(e.quest)) throw new Error(`Unknown quest "${e.quest}"`);
  } else if ('join' in e || 'leave' in e) {
    const id = 'join' in e ? e.join : e.leave;
    if (known.characters && !known.characters.has(id)) throw new Error(`Unknown party member "${id}"`);
  } else if (!('notify' in e)) throw new Error(`Unknown effect ${JSON.stringify(e)}`);
}

export function applyEffect(game: GameContext, e: Effect): void {
  const s = game.state;
  if ('set' in e) s.set(e.set, e.to ?? true);
  else if ('add' in e) s.add(e.add, e.by ?? 1);
  else if ('clear' in e) s.clear(e.clear);
  else if ('event' in e) game.events.emit('story:event', { id: e.event });
  else if ('learn' in e) learn(game, e.learn);
  else if ('item' in e) {
    const count = e.count ?? 1;
    const total = s.add(`inv.${e.item}`, count);
    game.events.emit('inventory:changed', { itemId: e.item, delta: count, total });
  } else if ('quest' in e) {
    const q = game.quests;
    if (e.do === 'complete') q.complete(e.quest);
    else if (e.do === 'fail') q.fail(e.quest);
    else q.start(e.quest);
  } else if ('join' in e) game.party.join(e.join);
  else if ('leave' in e) game.party.leave(e.leave);
  else if ('notify' in e) game.ui.notify(e.notify, 'info');
}

export function applyEffects(game: GameContext, effects: readonly Effect[] | undefined): void {
  if (effects) for (const e of effects) applyEffect(game, e);
}

/** Subaru learns something. Knowledge survives Return by Death. */
export function learn(game: GameContext, id: string): void {
  const k = KNOWLEDGE[id];
  if (!k) throw new Error(`Unknown knowledge "${id}"`);
  const key = `know.${id}`;
  if (game.state.bool(key)) return;
  game.state.set(key, true);
  game.events.emit('knowledge:learned', { id, title: k.title });
}

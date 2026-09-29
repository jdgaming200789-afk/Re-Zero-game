import { Object3D } from 'three';
import type { GameContext, GameSystem } from '../../game/GameContext';
import { Interactable } from '../../interaction/Interactable';
import { evaluate, type Condition, type ConditionContext } from '../Conditions';

export interface TalkEntry {
  /** Character to talk to. */
  who: string;
  dialogue: string;
  /** First entry whose condition holds wins. */
  if?: Condition;
}

/**
 * Lets Subaru talk to people: every character with talk entries gets a
 * "Talk" prompt, and the first entry whose condition holds decides the
 * conversation (so what they say follows the story).
 */
export class TalkSystem implements GameSystem {
  readonly name = 'talk';
  private readonly byWho = new Map<string, TalkEntry[]>();
  private readonly attached = new WeakSet<object>();
  private scan = 0;
  private readonly ctx: ConditionContext;

  constructor(private readonly game: GameContext) {
    this.ctx = {
      get: (k) => game.state.get(k),
      resolve: (k) => {
        if (k === 'area') return game.scenes.current?.id ?? '';
        if (k.startsWith('party.')) return game.party.isMember(k.slice(6));
        if (k === 'loop') return game.state.num('meta.loop');
        return undefined;
      },
    };
  }

  register(entries: TalkEntry[]): void {
    for (const e of entries) {
      const list = this.byWho.get(e.who) ?? [];
      list.push(e);
      this.byWho.set(e.who, list);
    }
  }

  /** The conversation `who` would have right now, if any. */
  current(who: string): string | null {
    for (const e of this.byWho.get(who) ?? []) if (evaluate(e.if, this.ctx) && this.game.dialogue.has(e.dialogue)) return e.dialogue;
    return null;
  }

  update(dt: number): void {
    this.scan -= dt;
    if (this.scan > 0) return;
    this.scan = 0.5;
    for (const actor of this.game.actors.all()) {
      if (this.attached.has(actor) || !this.byWho.has(actor.id)) continue;
      this.attached.add(actor);
      const anchor = new Object3D();
      anchor.position.y = Math.min(1.45, actor.visual.eyeHeight);
      actor.entity.object3D.add(anchor);
      const g = this.game;
      actor.entity.add(
        new Interactable({
          id: `talk.${actor.id}`,
          kind: 'talk',
          label: g.ui.speaker(actor.id).name,
          anchor,
          // Companions keep a little personal space, so reach a bit further.
          range: 3.4,
          angle: 55,
          priority: -0.2,
          condition: () => this.current(actor.id) !== null && g.mode === 'exploration',
          handler: async (ctx) => {
            await ctx.contact;
            const id = this.current(actor.id);
            if (id) await g.dialogue.play(id);
          },
        }),
      );
    }
  }
}

import { createLogger } from '../core/Log';
import type { GameContext, GameSystem } from '../game/GameContext';
import { evaluate, type Condition, type ConditionContext } from './Conditions';

const log = createLogger('Story');

export type StoryTriggerOn =
  | { areaEnter: string }
  | { event: string }
  | { flag: string }
  | { interact: string }
  | { zone: string }
  | { dialogueEnd: string }
  | { cinematicEnd: string };

export interface StoryTrigger {
  id: string;
  on: StoryTriggerOn;
  if?: Condition;
  play: { cinematic: string } | { dialogue: string };
  /** Seconds to wait after the trigger (area fade-ins, landing). */
  delay?: number;
  /** Fire once per loop (default). Uses world state, so it rewinds. */
  once?: boolean;
}

/**
 * Starts authored story beats: when something happens (an area is entered,
 * a story event fires, a flag turns on, an object is used, a zone crossed,
 * a scene ends) and the condition holds, the matching cinematic or
 * conversation plays. Beats queue instead of colliding. Also announces
 * newly learned knowledge.
 */
export class StoryDirector implements GameSystem {
  readonly name = 'story';
  private readonly triggers: StoryTrigger[] = [];
  private readonly queue: StoryTrigger[] = [];
  private busy = false;
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
    const ev = game.events;
    const fire = (match: (on: StoryTriggerOn) => boolean) => {
      for (const t of this.triggers) if (match(t.on)) this.consider(t);
    };
    ev.on('area:entered', ({ areaId }) => fire((o) => 'areaEnter' in o && o.areaEnter === areaId));
    ev.on('story:event', ({ id }) => fire((o) => 'event' in o && o.event === id));
    ev.on('flag:changed', ({ key, value }) => {
      if (value) fire((o) => 'flag' in o && o.flag === key);
    });
    ev.on('interaction:completed', ({ interactableId }) => fire((o) => 'interact' in o && o.interact === interactableId));
    ev.on('zone:entered', ({ zoneId }) => {
      // Places visited are story state (quest objectives read `visited.<zone>`).
      game.state.set(`visited.${zoneId.replace(/[^a-z0-9_.]/gi, '_')}`, true);
      fire((o) => 'zone' in o && o.zone === zoneId);
    });
    ev.on('dialogue:ended', ({ dialogueId }) => fire((o) => 'dialogueEnd' in o && o.dialogueEnd === dialogueId));
    ev.on('cinematic:ended', ({ cinematicId }) => fire((o) => 'cinematicEnd' in o && o.cinematicEnd === cinematicId));
    ev.on('knowledge:learned', ({ title }) => game.ui.notify(title, 'knowledge', 5));
  }

  register(triggers: StoryTrigger[]): void {
    for (const t of triggers) {
      if (this.triggers.some((x) => x.id === t.id)) throw new Error(`Duplicate story trigger "${t.id}"`);
      this.triggers.push(t);
    }
  }

  private consider(t: StoryTrigger): void {
    if ((t.once ?? true) && this.game.state.bool(`story.fired.${t.id}`)) return;
    if (!evaluate(t.if, this.ctx)) return;
    if (this.queue.includes(t)) return;
    this.queue.push(t);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const t = this.queue.shift()!;
        if (t.delay) await this.game.scheduler.wait(t.delay);
        // Never interrupt a scene or a menu; wait for gameplay.
        while (this.game.dialogue.playing || this.game.cinematics.playing || (this.game.mode !== 'exploration' && this.game.mode !== 'combat')) {
          await this.game.scheduler.wait(0.2, false);
        }
        if ((t.once ?? true) && this.game.state.bool(`story.fired.${t.id}`)) continue;
        if (!evaluate(t.if, this.ctx)) continue;
        if (t.once ?? true) this.game.state.set(`story.fired.${t.id}`, true);
        log.info(`Story beat ${t.id}`);
        if ('cinematic' in t.play) await this.game.cinematics.play(t.play.cinematic);
        else await this.game.dialogue.play(t.play.dialogue);
      }
    } catch (err) {
      log.error('Story beat failed', err);
    } finally {
      this.busy = false;
    }
  }
}

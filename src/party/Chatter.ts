import { Vector3 } from 'three';
import { createLogger } from '../core/Log';
import type { CharacterVisual } from '../characters/CharacterVisual';
import type { GameContext, GameSystem } from '../game/GameContext';
import { evaluate, type Condition, type ConditionContext } from '../story/Conditions';

const log = createLogger('Chatter');

export interface ChatterLine {
  speaker: string;
  text: string;
  expression?: string;
  /** Override the reading-time estimate (seconds). */
  seconds?: number;
}

export type ChatterTrigger =
  | { on: 'areaEnter'; area: string; delay?: number }
  | { on: 'interact'; id: string }
  | { on: 'flag'; key: string }
  | { on: 'idle'; area?: string; after: number }
  | { on: 'zone'; zone: string }
  | { on: 'event'; id: string };

export interface ChatterDef {
  id: string;
  trigger: ChatterTrigger;
  lines: ChatterLine[];
  condition?: Condition;
  /** Speakers other than Subaru are implied; list extra characters that must be present. */
  requires?: string[];
  /** Play only once per loop (default true). Uses world flags, so it rewinds. */
  once?: boolean;
  priority?: number;
}

const MAX_DISTANCE = 16;

/**
 * Ambient party banter: short exchanges triggered by places, discoveries and
 * lulls, spoken as barks while the player keeps control. Lines are data
 * (src/data/chatter.ts). Only companions who are actually present and near
 * can speak, and only one exchange plays at a time.
 */
export class ChatterSystem implements GameSystem {
  readonly name = 'chatter';
  private readonly defs: ChatterDef[] = [];
  private playing: ChatterDef | null = null;
  private idleTime = 0;
  private readonly ctx: ConditionContext;
  private generation = 0;

  constructor(private readonly game: GameContext) {
    this.ctx = {
      get: (k) => game.state.get(k),
      resolve: (k) => {
        if (k === 'area') return game.scenes.current?.id ?? '';
        if (k.startsWith('party.')) return this.present(k.slice(6));
        if (k === 'loop') return game.state.num('meta.loop');
        return undefined;
      },
    };
    const ev = game.events;
    ev.on('area:entered', ({ areaId }) => {
      this.idleTime = 0;
      this.stop();
      for (const d of this.defs) {
        if (d.trigger.on === 'areaEnter' && d.trigger.area === areaId) {
          const delay = d.trigger.delay ?? 1.5;
          const gen = this.generation;
          void game.scheduler.wait(delay).then(() => gen === this.generation && this.tryPlay(d));
        }
      }
    });
    ev.on('interaction:completed', ({ interactableId }) => this.fire((t) => t.on === 'interact' && t.id === interactableId));
    ev.on('zone:entered', ({ zoneId }) => this.fire((t) => t.on === 'zone' && t.zone === zoneId));
    ev.on('story:event', ({ id }) => this.fire((t) => t.on === 'event' && t.id === id));
    ev.on('flag:changed', ({ key, value }) => {
      if (value) this.fire((t) => t.on === 'flag' && t.key === key);
    });
    ev.on('game:modeChanged', ({ to }) => {
      if (to !== 'exploration') this.stop();
    });
  }

  register(defs: ChatterDef[]): void {
    for (const d of defs) {
      if (this.defs.some((x) => x.id === d.id)) throw new Error(`Duplicate chatter "${d.id}"`);
      this.defs.push(d);
    }
  }

  get current(): string | null {
    return this.playing?.id ?? null;
  }

  update(dt: number): void {
    const player = this.game.player;
    if (!player || this.game.mode !== 'exploration') return;
    this.idleTime = player.followTarget.speed < 0.2 ? this.idleTime + dt : 0;
    if (this.playing || this.idleTime < 4) return;
    const area = this.game.scenes.current?.id;
    for (const d of this.defs) {
      const t = d.trigger;
      if (t.on === 'idle' && (!t.area || t.area === area) && this.idleTime >= t.after && this.eligible(d)) {
        this.idleTime = 0;
        void this.play(d);
        return;
      }
    }
  }

  private fire(match: (t: ChatterTrigger) => boolean): void {
    const candidates = this.defs.filter((d) => match(d.trigger)).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const d of candidates) if (this.tryPlay(d)) return;
  }

  private tryPlay(d: ChatterDef): boolean {
    if (this.game.mode !== 'exploration' || !this.eligible(d)) return false;
    if (this.playing) {
      // A more important exchange cuts in; otherwise let the current finish.
      if ((d.priority ?? 0) <= (this.playing.priority ?? 0)) return false;
      this.stop();
    }
    void this.play(d);
    return true;
  }

  /** Is a speaker here and close enough to be heard? */
  present(id: string): boolean {
    const g = this.game;
    if (g.player?.characterId === id) return true;
    const a = g.party.follower(id);
    return !!a && a.position.distanceTo(g.party.leaderPosition) < MAX_DISTANCE;
  }

  eligible(d: ChatterDef): boolean {
    if ((d.once ?? true) && this.game.state.bool(`chatter.${d.id}`)) return false;
    const speakers = new Set([...d.lines.map((l) => l.speaker), ...(d.requires ?? [])]);
    for (const s of speakers) if (!this.present(s)) return false;
    return evaluate(d.condition, this.ctx);
  }

  stop(): void {
    this.generation++;
    this.playing = null;
  }

  private visualOf(id: string): CharacterVisual | null {
    const g = this.game;
    if (g.player?.characterId === id) return g.player.visual;
    return g.party.follower(id)?.visual ?? g.actors.get(id)?.visual ?? null;
  }

  private async play(d: ChatterDef): Promise<void> {
    const gen = ++this.generation;
    this.playing = d;
    if (d.once ?? true) this.game.state.set(`chatter.${d.id}`, true);
    log.info(`Chatter ${d.id}`);
    const head = new Vector3();
    let prevSpeaker: string | null = null;
    try {
      for (const line of d.lines) {
        if (gen !== this.generation) return;
        const v = this.visualOf(line.speaker);
        if (!v || !this.present(line.speaker)) return;
        const seconds = line.seconds ?? Math.min(7, Math.max(2.2, 1.4 + line.text.length * 0.055));
        this.game.events.emit('bark:play', { speakerId: line.speaker, text: line.text, duration: seconds });
        if (line.expression) v.setExpression(line.expression, 1, seconds + 1);
        v.setSpeaking(true);
        // Everyone turns to the speaker; the speaker addresses whoever
        // spoke last (companion brains default to looking at Subaru).
        v.socketPosition('head', head);
        this.game.party.attend(head, seconds + 0.4, line.speaker);
        const player = this.game.player;
        const isPlayer = player?.characterId === line.speaker;
        if (player && !isPlayer) player.visual.lookAt(head, 0.8);
        const listener = prevSpeaker && prevSpeaker !== line.speaker ? this.visualOf(prevSpeaker) : null;
        if (isPlayer && listener) v.lookAt(listener.socketPosition('head', new Vector3()), 0.8);
        const speakTime = Math.min(seconds * 0.75, 0.35 + line.text.length * 0.045);
        await this.game.scheduler.wait(speakTime);
        v.setSpeaking(false);
        await this.game.scheduler.wait(seconds - speakTime + 0.25);
        if (isPlayer) v.lookAt(null);
        else player?.visual.lookAt(null);
        prevSpeaker = line.speaker;
      }
    } finally {
      if (gen === this.generation) this.playing = null;
    }
  }
}

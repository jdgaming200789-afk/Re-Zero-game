import { createLogger } from '../../core/Log';
import type { GameContext, GameSystem } from '../../game/GameContext';
import { evaluate, type ConditionContext } from '../Conditions';
import { applyEffects } from '../Effects';
import { evaluateQuest, objectiveKey, questKey, questStatus, type ObjectiveDef, type ObjectiveView, type QuestDef, type QuestStatus } from './Quest';

const log = createLogger('Quests');

export type QuestChange =
  | { kind: 'started'; quest: QuestDef }
  | { kind: 'objective'; quest: QuestDef; objective: ObjectiveDef }
  | { kind: 'completed'; quest: QuestDef }
  | { kind: 'failed'; quest: QuestDef }
  | { kind: 'resync' };

/**
 * Quests and their objectives. State is kept in world flags
 * (`quest.<id>` = active|done|failed, `quest.<id>.<objective>` = true), so
 * saving is free and Return by Death rewinds quests along with the world.
 * Objectives complete by themselves when their condition holds; the system
 * re-evaluates whenever story state changes.
 */
export class QuestSystem implements GameSystem {
  readonly name = 'quests';
  private readonly defs = new Map<string, QuestDef>();
  private dirty = true;
  private silent = false;
  private readonly listeners = new Set<(c: QuestChange) => void>();
  private readonly ctx: ConditionContext;
  /** The quest shown on the HUD tracker. */
  tracked: string | null = null;

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
    ev.on('flag:changed', ({ key }) => {
      if (key === '*') this.silent = true; // a rewind or a load: no fanfare
      if (!key.startsWith('dlg.') && !key.startsWith('chatter.')) this.dirty = true;
    });
    ev.on('area:entered', () => (this.dirty = true));
    ev.on('rbd:returned', () => {
      this.silent = true;
      this.dirty = true;
    });
  }

  register(defs: QuestDef[]): void {
    for (const d of defs) {
      if (this.defs.has(d.id)) throw new Error(`Duplicate quest "${d.id}"`);
      this.defs.set(d.id, d);
    }
  }

  get(id: string): QuestDef | undefined {
    return this.defs.get(id);
  }

  all(): QuestDef[] {
    return Array.from(this.defs.values());
  }

  status(id: string): QuestStatus {
    return questStatus((k) => this.game.state.get(k), id);
  }

  /** Quests in a given state, main story first. */
  list(status: QuestStatus): QuestDef[] {
    return this.all()
      .filter((q) => this.status(q.id) === status)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'main' ? -1 : 1));
  }

  objectives(id: string): ObjectiveView[] {
    const def = this.defs.get(id);
    return def ? evaluateQuest(def, (k) => this.game.state.get(k), this.ctx).objectives : [];
  }

  onChange(fn: (c: QuestChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: QuestChange): void {
    for (const fn of this.listeners) fn(c);
  }

  start(id: string): void {
    const def = this.need(id);
    const st = this.status(id);
    if (st === 'active' || st === 'done') return;
    this.game.state.set(questKey(id), 'active');
    if (def.kind === 'main' || !this.tracked || this.status(this.tracked) !== 'active') this.tracked = id;
    log.info(`Quest started: ${id}`);
    this.game.events.emit('quest:started', { questId: id });
    if (!this.silent) this.game.ui.notify(def.title, 'quest');
    this.emit({ kind: 'started', quest: def });
    this.dirty = true;
  }

  complete(id: string): void {
    const def = this.need(id);
    if (this.status(id) === 'done') return;
    for (const o of def.objectives) if (!o.optional) this.game.state.set(objectiveKey(id, o.id), true);
    this.game.state.set(questKey(id), 'done');
    log.info(`Quest complete: ${id}`);
    applyEffects(this.game, def.onComplete);
    this.game.events.emit('quest:completed', { questId: id });
    this.emit({ kind: 'completed', quest: def });
    if (this.tracked === id) this.tracked = this.list('active')[0]?.id ?? null;
  }

  fail(id: string): void {
    const def = this.need(id);
    if (this.status(id) !== 'active') return;
    this.game.state.set(questKey(id), 'failed');
    this.emit({ kind: 'failed', quest: def });
    if (this.tracked === id) this.tracked = this.list('active')[0]?.id ?? null;
  }

  track(id: string): void {
    if (this.status(id) === 'active') {
      this.tracked = id;
      this.emit({ kind: 'resync' });
    }
  }

  private need(id: string): QuestDef {
    const d = this.defs.get(id);
    if (!d) throw new Error(`Unknown quest "${id}"`);
    return d;
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const g = this.game;
    const get = (k: string) => g.state.get(k);
    for (const def of this.defs.values()) {
      const st = this.status(def.id);
      if (st === 'inactive' && def.autoStart !== undefined) {
        if (evaluate(def.autoStart, this.ctx)) this.start(def.id);
        continue;
      }
      if (st !== 'active') continue;
      const r = evaluateQuest(def, get, this.ctx);
      if (r.failed) {
        this.fail(def.id);
        continue;
      }
      for (const o of r.newlyDone) {
        g.state.set(objectiveKey(def.id, o.id), true);
        g.events.emit('quest:objectiveUpdated', { questId: def.id, objectiveId: o.id });
        if (!this.silent) this.emit({ kind: 'objective', quest: def, objective: o });
      }
      if (r.complete) this.complete(def.id);
    }
    if (this.tracked && this.status(this.tracked) !== 'active') this.tracked = null;
    if (!this.tracked) this.tracked = this.list('active')[0]?.id ?? null;
    if (this.silent) this.emit({ kind: 'resync' });
    this.silent = false;
  }
}

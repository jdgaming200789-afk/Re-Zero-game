import { createLogger } from '../../core/Log';
import { CHECKPOINTS, type CheckpointDef } from '../../data/deaths';
import type { GameContext } from '../../game/GameContext';
import { el } from '../../ui/dom';
import type { FlagSnapshot } from '../../world/WorldStateManager';

const log = createLogger('ReturnPoint');

/** Where, and in what state of the world, Subaru will wake up after dying. */
export interface ReturnPoint {
  id: string;
  area: string;
  spawn: string;
  name: string;
  /** World-scope flags at the moment it was set. */
  flags: FlagSnapshot;
  /** Loop in which it was set. */
  loop: number;
}

/**
 * Return points ("save points" of fate). Reaching one snapshots the world
 * state; dying restores it. Knowledge (`know.*`) and loop bookkeeping
 * (`meta.*`) are never part of the snapshot — that is the whole point.
 */
export class CheckpointSystem {
  current: ReturnPoint | null = null;
  private readonly notice: HTMLElement;
  private noticeTimer = 0;

  constructor(private readonly game: GameContext) {
    this.notice = game.ui.layers.hud.appendChild(el('div', { class: 'rz-returnpoint' }, [el('i', { class: 'sigil' }), el('span', { class: 'txt' })]));
    game.events.on('rbd:deathBegan', () => this.notice.classList.remove('visible'));
  }

  def(id: string): CheckpointDef {
    const d = CHECKPOINTS[id];
    if (!d) throw new Error(`Unknown return point "${id}"`);
    return d;
  }

  /** Set the return point here and now. */
  reach(id: string): void {
    const d = this.def(id);
    const g = this.game;
    this.current = { id, area: d.area, spawn: d.spawn, name: d.name, flags: g.state.snapshot(['world']), loop: g.state.num('meta.loop', 1) };
    g.state.set('meta.checkpoint', id);
    g.events.emit('checkpoint:reached', { checkpointId: id });
    log.info(`Return point: ${id}`);
    this.showNotice(d.name);
    g.saves.autosave();
  }

  private showNotice(name: string): void {
    this.notice.querySelector('.txt')!.textContent = name;
    this.notice.classList.add('visible');
    const token = ++this.noticeTimer;
    void this.game.scheduler.wait(4.5, false).then(() => {
      if (token === this.noticeTimer) this.notice.classList.remove('visible');
    });
  }
}

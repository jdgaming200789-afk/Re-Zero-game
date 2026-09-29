import type { GameContext } from '../../game/GameContext';
import type { QuestSystem } from '../../story/quests/QuestSystem';
import { el } from '../dom';
import '../styles/quests.css';

/**
 * Top-right objective tracker for the tracked quest, plus the centre banner
 * for new and completed quests. Completed objectives tick, strike through
 * and fade; new ones slide in. Hidden during conversations and cutscenes.
 */
export class QuestTracker {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly list: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly rows = new Map<string, HTMLElement>();
  private shownQuest: string | null = null;
  private bannerQueue: Array<{ kicker: string; title: string; done: boolean }> = [];
  private bannerBusy = false;

  constructor(
    private readonly game: GameContext,
    private readonly quests: QuestSystem,
  ) {
    this.title = el('div', { class: 'qt-title' });
    this.list = el('div', { class: 'qt-list' });
    this.root = game.ui.layers.hud.appendChild(el('div', { class: 'rz-tracker' }, [el('div', { class: 'qt-kicker', text: 'Objective' }), this.title, this.list]));
    this.banner = game.ui.layers.hud.appendChild(el('div', { class: 'rz-quest-banner' }));
    quests.onChange((c) => {
      if (c.kind === 'started') this.queueBanner('New Quest', c.quest.title, false);
      else if (c.kind === 'completed') this.queueBanner('Quest Complete', c.quest.title, true);
      if (c.kind === 'objective' && c.quest.id === this.shownQuest) this.tick(c.objective.id);
      else this.render();
    });
    const ev = game.events;
    ev.on('game:modeChanged', ({ to }) => {
      this.updateVisibility();
      // A banner never plays over a scene or a death.
      if (to !== 'exploration' && to !== 'combat') this.banner.classList.remove('visible');
    });
    ev.on('flag:changed', ({ key }) => {
      if (key === '*' || key.startsWith('quest.')) this.render();
    });
    this.render();
  }

  private updateVisibility(): void {
    const m = this.game.mode;
    const show = !!this.shownQuest && (m === 'exploration' || m === 'combat');
    this.root.classList.toggle('visible', show);
    this.root.classList.toggle('dim', m === 'combat');
  }

  /** Rebuild from quest state (cheap: a handful of rows). */
  render(): void {
    const id = this.quests.tracked;
    const def = id ? this.quests.get(id) : undefined;
    if (!def) {
      this.shownQuest = null;
      this.updateVisibility();
      return;
    }
    if (id !== this.shownQuest) {
      this.list.textContent = '';
      this.rows.clear();
      this.shownQuest = id;
    }
    this.title.textContent = def.title;
    const views = this.quests.objectives(def.id);
    const keep = new Set<string>();
    for (const v of views) {
      if (!v.visible || v.done) continue;
      keep.add(v.def.id);
      if (this.rows.has(v.def.id)) continue;
      const row = el('div', { class: `qt-row${v.def.optional ? ' optional' : ''}` }, [el('i', { class: 'box' }), el('span', { class: 'txt', text: v.def.text })]);
      this.rows.set(v.def.id, row);
      this.list.appendChild(row);
    }
    for (const [oid, row] of this.rows) {
      if (keep.has(oid) || row.classList.contains('done')) continue;
      row.remove();
      this.rows.delete(oid);
    }
    this.updateVisibility();
  }

  /** Check an objective off with a flourish, then refresh. */
  private tick(objectiveId: string): void {
    const row = this.rows.get(objectiveId);
    if (!row) {
      this.render();
      return;
    }
    row.classList.add('done');
    window.setTimeout(() => {
      row.classList.add('gone');
      window.setTimeout(() => {
        row.remove();
        this.rows.delete(objectiveId);
        this.render();
      }, 450);
    }, 1400);
    // New objectives can appear right away.
    window.setTimeout(() => this.render(), 700);
  }

  private queueBanner(kicker: string, title: string, done: boolean): void {
    this.bannerQueue.push({ kicker, title, done });
    if (!this.bannerBusy) void this.nextBanner();
  }

  private async nextBanner(): Promise<void> {
    const b = this.bannerQueue.shift();
    if (!b) {
      this.bannerBusy = false;
      return;
    }
    this.bannerBusy = true;
    // Wait for conversations/cutscenes to finish: the banner is a moment of its own.
    while (this.game.mode !== 'exploration' && this.game.mode !== 'combat') await this.game.scheduler.wait(0.25, false);
    this.banner.textContent = '';
    this.banner.className = `rz-quest-banner${b.done ? ' done' : ''}`;
    this.banner.append(el('div', { class: 'kicker', text: b.kicker }), el('div', { class: 'title', text: b.title }), el('div', { class: 'rz-rule' }));
    void this.banner.offsetWidth;
    this.banner.classList.add('visible');
    await this.game.scheduler.wait(3.4, false);
    this.banner.classList.remove('visible');
    await this.game.scheduler.wait(0.8, false);
    void this.nextBanner();
  }
}

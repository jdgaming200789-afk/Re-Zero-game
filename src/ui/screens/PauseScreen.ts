import type { GameContext } from '../../game/GameContext';
import { el } from '../dom';
import { MenuList } from './MenuList';
import { Screen } from './Screen';

/**
 * The pause menu: where you are, what you're doing, and the way into every
 * other screen.
 */
export class PauseScreen extends Screen {
  readonly id = 'pause';
  override readonly hotkey = 'pause' as const;
  override readonly inCombat = true;
  private readonly list = new MenuList();
  private readonly status: HTMLElement;

  constructor(game: GameContext) {
    super(game);
    this.root.classList.add('rz-pause');
    this.status = el('div', { class: 'status' });
    this.root.append(
      el('div', { class: 'rz-panel panel' }, [
        el('div', { class: 'brand' }, [el('div', { class: 'kicker', text: 'Re:Zero' }), el('div', { class: 'title', text: 'Paused' }), this.status]),
        this.list.root,
      ]),
    );
    const s = () => game.screens;
    this.list.setRows([
      { id: 'resume', label: 'Resume', activate: () => s().hide() },
      { id: 'journal', label: 'Journal', hint: 'Quests · what Subaru remembers · conversations', activate: () => s().show('journal') },
      { id: 'inventory', label: 'Inventory', activate: () => s().show('inventory') },
      { id: 'map', label: 'Map', activate: () => s().show('map') },
      { id: 'save', label: 'Save Game', activate: () => s().show('saves', 'save'), enabled: () => game.saves.blocked() === null },
      { id: 'load', label: 'Load Game', activate: () => s().show('saves', 'load') },
      { id: 'settings', label: 'Settings', activate: () => s().show('settings') },
      { id: 'title', label: 'Return to Title', activate: () => window.location.assign(window.location.pathname) },
    ]);
  }

  protected onOpen(): void {
    const g = this.game;
    const area = g.scenes.current;
    const q = g.quests.tracked ? g.quests.get(g.quests.tracked) : undefined;
    const obj = q ? g.quests.objectives(q.id).find((o) => o.visible && !o.done) : undefined;
    const rp = g.checkpoints.current;
    const loop = g.state.num('meta.loop', 1);
    this.status.textContent = '';
    const parts = [
      el('div', {}, ['Location', el('br'), el('b', { text: area?.displayName ?? '—' })]),
      q ? el('div', {}, ['Objective', el('br'), el('b', { text: obj?.def.text ?? q.title })]) : null,
      rp ? el('div', {}, ['Return point', el('br'), el('b', { text: rp.name })]) : null,
      loop > 1 ? el('div', { class: 'loop', text: `This is the ${ordinal(loop)} time.` }) : null,
    ];
    for (const p of parts) if (p) this.status.append(p);
    this.list.selected = 0;
    this.list.refresh();
  }

  handleInput(): boolean {
    this.list.handleInput(this.game.input);
    return false;
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

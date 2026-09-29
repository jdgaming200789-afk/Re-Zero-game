import type { GameContext } from '../../game/GameContext';
import type { SaveData, SaveSlot } from '../../save/SaveSystem';
import { el } from '../dom';
import { MenuList, type MenuRow } from './MenuList';
import { Screen } from './Screen';

const SLOT_NAME: Record<SaveSlot, string> = { auto: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

function describe(d: SaveData): string {
  const mins = Math.round(d.playtime / 60);
  const time = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  const date = new Date(d.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return [d.summary.area, d.summary.quest, `Loop ${d.summary.loop}`, time, date].filter(Boolean).join(' · ');
}

/**
 * Save and load. Overwriting or loading asks once more ("press again");
 * the autosave can be loaded but never written by hand.
 */
export class SaveScreen extends Screen {
  readonly id = 'saves';
  private mode: 'save' | 'load' = 'load';
  private readonly list = new MenuList('rz-saves');
  private readonly title: HTMLElement;
  private readonly msg: HTMLElement;
  private armed: SaveSlot | null = null;

  constructor(game: GameContext) {
    super(game);
    this.root.classList.add('rz-saves');
    this.title = el('h2', { class: 'rz-heading' });
    this.msg = el('div', { class: 'msg' });
    this.root.append(
      el('div', { class: 'rz-panel rz-sframe' }, [
        this.title,
        el('div', { class: 'rz-rule' }),
        el('div', { class: 'scroll' }, [this.list.root]),
        this.msg,
        el('div', { class: 'foot' }, [game.ui.key('confirm'), 'Select', el('span', { class: 'gap' }), game.ui.key('cancel'), 'Back']),
      ]),
    );
  }

  protected onOpen(arg?: string): void {
    this.mode = arg === 'save' ? 'save' : 'load';
    this.title.textContent = this.mode === 'save' ? 'Save Game' : 'Load Game';
    this.armed = null;
    const blocked = this.mode === 'save' ? this.game.saves.blocked() : null;
    this.msg.textContent = blocked ?? '';
    this.render(false);
  }

  private render(keep = true): void {
    const rows: MenuRow[] = this.game.saves.list().map(({ slot, data }) => ({
      id: slot,
      label: SLOT_NAME[slot],
      hint: data ? describe(data) : 'Empty',
      enabled: () => (this.mode === 'load' ? !!data : slot !== 'auto' && this.game.saves.blocked() === null),
      activate: () => this.pick(slot, data),
    }));
    this.list.setRows(rows, keep);
  }

  private pick(slot: SaveSlot, data: SaveData | null): void {
    const g = this.game;
    if (this.mode === 'save') {
      if (data && this.armed !== slot) {
        this.armed = slot;
        this.msg.textContent = `Overwrite ${SLOT_NAME[slot]}? Select it again to confirm.`;
        return;
      }
      const r = g.saves.save(slot);
      this.armed = null;
      this.msg.textContent = r.ok ? (r.reason ?? 'Saved.') : (r.reason ?? 'Could not save.');
      this.render();
      return;
    }
    if (!data) return;
    const inGame = !!g.scenes.current;
    if (inGame && this.armed !== slot) {
      this.armed = slot;
      this.msg.textContent = 'Load this save? Progress since your last save will be lost. Select it again to confirm.';
      return;
    }
    this.armed = null;
    g.screens.hide();
    void g.saves.load(slot);
  }

  handleInput(): boolean {
    const before = this.list.selected;
    this.list.handleInput(this.game.input);
    if (this.list.selected !== before && this.armed) {
      this.armed = null;
      this.msg.textContent = '';
    }
    return false;
  }
}

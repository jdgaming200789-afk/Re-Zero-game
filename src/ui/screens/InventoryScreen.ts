import { SubaruCombat } from '../../combat/SubaruCombat';
import { ITEMS, type ItemDef } from '../../data/items';
import type { GameContext } from '../../game/GameContext';
import { el } from '../dom';
import { MenuList } from './MenuList';
import { Screen } from './Screen';

const KIND: Record<ItemDef['kind'], string> = { consumable: 'Consumable', key: 'Key item', document: 'Document' };

/**
 * What Subaru carries: counts from story state, details and documents to
 * read, and items that can be used from here (a tonic, the carriage bell).
 */
export class InventoryScreen extends Screen {
  readonly id = 'inventory';
  override readonly hotkey = 'inventory' as const;
  private readonly list = new MenuList();
  private readonly detail: HTMLElement;

  constructor(game: GameContext) {
    super(game);
    this.root.classList.add('rz-inventory');
    this.detail = el('div', { class: 'detail' });
    this.root.append(
      el('div', { class: 'rz-panel rz-sframe' }, [
        el('h2', { class: 'rz-heading', text: 'Inventory' }),
        el('div', { class: 'rz-rule' }),
        el('div', { class: 'body scroll' }, [this.list.root, this.detail]),
        el('div', { class: 'foot' }, [el('span', { class: 'rz-key', text: game.ui.actionGlyph('confirm') }), 'Use', el('span', { class: 'gap' }), el('span', { class: 'rz-key', text: game.ui.actionGlyph('cancel') }), 'Back']),
      ]),
    );
  }

  private owned(): ItemDef[] {
    return Object.values(ITEMS).filter((i) => this.game.state.num(`inv.${i.id}`) > 0);
  }

  protected onOpen(): void {
    this.rebuild(false);
  }

  private rebuild(keep = true): void {
    const items = this.owned();
    if (!items.length) {
      this.list.setRows([{ id: 'none', label: 'Nothing but the clothes on his back.', kind: 'header' }], false);
      this.detail.textContent = '';
      return;
    }
    const groups: Array<[string, ItemDef[]]> = [
      ['Consumables', items.filter((i) => i.kind === 'consumable')],
      ['Key items', items.filter((i) => i.kind === 'key')],
      ['Documents', items.filter((i) => i.kind === 'document')],
    ];
    const rows = groups.flatMap(([label, list]) =>
      list.length
        ? [
            { id: `h.${label}`, label, kind: 'header' as const },
            ...list.map((i) => ({
              id: i.id,
              label: i.name,
              kind: 'action' as const,
              value: () => (i.kind === 'consumable' ? `×${this.game.state.num(`inv.${i.id}`)}` : ''),
              focus: () => this.show(i),
              activate: i.use ? () => this.use(i) : undefined,
            })),
          ]
        : [],
    );
    this.list.setRows(rows, keep);
    const cur = ITEMS[this.list.current?.id ?? ''];
    if (cur) this.show(cur);
  }

  private show(i: ItemDef): void {
    this.detail.textContent = '';
    const parts = [
      el('div', { class: 'kind', text: KIND[i.kind] }),
      el('h3', { text: i.name }),
      el('p', { text: i.description }),
      i.text ? el('div', { class: 'doc', text: i.text }) : null,
      i.use ? el('div', { class: 'use', text: `${this.game.ui.actionGlyph('confirm')} — ${i.verb ?? 'Use'}` }) : null,
    ];
    for (const p of parts) if (p) this.detail.append(p);
  }

  private use(i: ItemDef): void {
    const g = this.game;
    if (i.use === 'heal') {
      const sc = g.player?.entity.get(SubaruCombat);
      if (!sc || !sc.drinkTonic()) {
        g.ui.notify('No need right now.', 'warning');
        return;
      }
      g.screens.hide();
    } else if (i.use === 'ring') {
      g.screens.hide();
      const p = g.player;
      if (!p) return;
      // Clear, carrying, and heard by everything under the sand for a long way.
      g.events.emit('audio:stinger', { id: 'bell' });
      g.enemies.noise(p.entity.object3D.position, 40);
      g.events.emit('story:event', { id: 'bell.rung' });
      void p.visual.play('reachMid');
      g.events.emit('bark:play', { speakerId: 'subaru', text: 'Come on, then. Come and get me.', duration: 2.5 });
    }
    this.rebuild();
  }

  handleInput(): boolean {
    this.list.handleInput(this.game.input);
    return false;
  }
}

import type { InputManager } from '../../input/InputManager';
import { el } from '../dom';
import '../styles/menus.css';

export interface MenuRow {
  id: string;
  label: string;
  kind?: 'action' | 'option' | 'slider' | 'toggle' | 'header';
  /** Current value text (options) or on/off (toggles). */
  value?: () => string;
  /** 0..1 fill for sliders. */
  fraction?: () => number;
  /** Left/right on options, sliders and toggles. */
  adjust?: (dir: -1 | 1) => void;
  /** Confirm / click. */
  activate?: () => void;
  enabled?: () => boolean;
  /** Small text under the label. */
  hint?: string;
  /** Called when the row gains focus (detail panes). */
  focus?: () => void;
}

/**
 * A vertical menu that reads the same from keyboard, gamepad and mouse:
 * up/down to move (skipping headers and disabled rows), left/right to change
 * values, confirm to act. Every screen builds its content out of these.
 */
export class MenuList {
  readonly root: HTMLElement;
  private rows: MenuRow[] = [];
  private nodes: HTMLElement[] = [];
  selected = 0;
  onChange?: () => void;

  constructor(className = '') {
    this.root = el('div', { class: `rz-menu ${className}` });
  }

  setRows(rows: MenuRow[], keepSelection = true): void {
    this.rows = rows;
    if (!keepSelection) this.selected = 0;
    this.selected = this.nearestSelectable(Math.min(this.selected, rows.length - 1), 1);
    this.build();
  }

  get current(): MenuRow | undefined {
    return this.rows[this.selected];
  }

  private selectable(i: number): boolean {
    const r = this.rows[i];
    return !!r && r.kind !== 'header' && (r.enabled?.() ?? true);
  }

  private nearestSelectable(from: number, dir: 1 | -1): number {
    const n = this.rows.length;
    for (let k = 0; k < n; k++) {
      const i = (((from + k * dir) % n) + n) % n;
      if (this.selectable(i)) return i;
    }
    return Math.max(0, from);
  }

  private build(): void {
    this.root.textContent = '';
    this.nodes = this.rows.map((r, i) => {
      const kind = r.kind ?? 'action';
      const row = el('div', { class: `row ${kind}` });
      if (kind === 'header') {
        row.textContent = r.label;
        return this.root.appendChild(row);
      }
      const label = el('div', { class: 'label' }, [el('span', { class: 'txt', text: r.label }), r.hint ? el('span', { class: 'hint', text: r.hint }) : null]);
      row.appendChild(el('i', { class: 'mark' }));
      row.appendChild(label);
      if (kind === 'option' || kind === 'toggle') {
        const left = el('button', { class: 'arrow', type: 'button', text: '◀' });
        const right = el('button', { class: 'arrow', type: 'button', text: '▶' });
        left.addEventListener('click', (e) => {
          e.stopPropagation();
          this.select(i);
          r.adjust?.(-1);
          this.refresh();
        });
        right.addEventListener('click', (e) => {
          e.stopPropagation();
          this.select(i);
          r.adjust?.(1);
          this.refresh();
        });
        row.appendChild(el('div', { class: 'value' }, [left, el('span', { class: 'v' }), right]));
      } else if (kind === 'action' && r.value) {
        row.appendChild(el('div', { class: 'value compact' }, [el('span', { class: 'v' })]));
      } else if (kind === 'slider') {
        const bar = el('div', { class: 'bar' }, [el('i')]);
        bar.addEventListener('click', (e) => {
          e.stopPropagation();
          this.select(i);
          const rect = bar.getBoundingClientRect();
          const want = (e.clientX - rect.left) / rect.width;
          // Step towards the clicked point.
          for (let guard = 0; guard < 40; guard++) {
            const f = r.fraction?.() ?? 0;
            if (Math.abs(f - want) < 0.04) break;
            r.adjust?.(want > f ? 1 : -1);
            if ((r.fraction?.() ?? 0) === f) break;
          }
          this.refresh();
        });
        row.appendChild(el('div', { class: 'value' }, [bar, el('span', { class: 'v' })]));
      }
      row.addEventListener('mouseenter', () => this.selectable(i) && this.select(i));
      row.addEventListener('click', () => {
        if (!this.selectable(i)) return;
        this.select(i);
        if (kind === 'toggle') r.adjust?.(1);
        else r.activate?.();
        this.refresh();
      });
      return this.root.appendChild(row);
    });
    this.refresh();
  }

  /** Update values and highlight without rebuilding. */
  refresh(): void {
    this.rows.forEach((r, i) => {
      const n = this.nodes[i];
      if (!n || r.kind === 'header') return;
      n.classList.toggle('selected', i === this.selected);
      n.classList.toggle('disabled', !(r.enabled?.() ?? true));
      const v = n.querySelector('.v');
      if (v && r.value) v.textContent = r.value();
      const fill = n.querySelector<HTMLElement>('.bar > i');
      if (fill && r.fraction) fill.style.transform = `scaleX(${Math.max(0, Math.min(1, r.fraction()))})`;
    });
    this.onChange?.();
  }

  select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.rows[i]?.focus?.();
    this.refresh();
    this.nodes[i]?.scrollIntoView({ block: 'nearest' });
  }

  /** Handle navigation input. Returns true if a row was activated. */
  handleInput(input: InputManager): boolean {
    if (input.pressed('navDown')) this.select(this.nearestSelectable(this.selected + 1, 1));
    else if (input.pressed('navUp')) this.select(this.nearestSelectable(this.selected - 1, -1));
    const r = this.rows[this.selected];
    if (!r || !this.selectable(this.selected)) return false;
    if (input.pressed('navLeft') && r.adjust) {
      r.adjust(-1);
      this.refresh();
    } else if (input.pressed('navRight') && r.adjust) {
      r.adjust(1);
      this.refresh();
    }
    if (input.pressed('confirm')) {
      input.consume('confirm');
      if (r.kind === 'toggle') r.adjust?.(1);
      else if (r.activate) r.activate();
      else return false;
      this.refresh();
      return true;
    }
    return false;
  }
}

/** Cycle through a list of values. */
export function cycle<T>(list: readonly T[], current: T, dir: -1 | 1): T {
  const i = list.indexOf(current);
  return list[(((i < 0 ? 0 : i) + dir) % list.length + list.length) % list.length]!;
}

/** Step a number within [min, max]. */
export function stepNum(v: number, dir: -1 | 1, step: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, v + dir * step)) / step) * step;
}
